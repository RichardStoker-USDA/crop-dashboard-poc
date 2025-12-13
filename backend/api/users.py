from fastapi import APIRouter, HTTPException, status, Request
from backend.core.dependencies import DbSession, AdminUser
from backend.schemas.user import UserCreate, UserUpdate, UserResponse
from backend.services.auth import create_user, get_user_by_email
from backend.models import User, AuditLog

router = APIRouter()


@router.get("", response_model=list[UserResponse])
def list_users(db: DbSession, admin: AdminUser):
    users = db.query(User).all()
    return [
        UserResponse(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            is_admin=u.is_admin,
            is_active=u.is_active,
            created_at=u.created_at,
            last_login=u.last_login,
            groups=[ug.group.name for ug in u.groups]
        )
        for u in users
    ]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_new_user(user_data: UserCreate, db: DbSession, admin: AdminUser, request: Request):
    existing = get_user_by_email(db, user_data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )
    user = create_user(
        db,
        email=user_data.email,
        password=user_data.password,
        full_name=user_data.full_name,
        is_admin=user_data.is_admin
    )

    # Audit log
    audit = AuditLog(
        user_id=admin.id,
        action="user_created",
        resource_type="user",
        resource_id=user.id,
        details={"email": user.email, "full_name": user.full_name, "is_admin": user.is_admin},
        ip_address=request.client.host if request.client else None
    )
    db.add(audit)
    db.commit()

    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
        groups=[]
    )


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: str, db: DbSession, admin: AdminUser):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
        groups=[ug.group.name for ug in user.groups]
    )


@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: str, user_data: UserUpdate, db: DbSession, admin: AdminUser, request: Request):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Track changes for audit logging
    old_is_admin = user.is_admin
    old_is_active = user.is_active
    changes = {}

    # Prevent deactivating or removing admin status from admin users
    if user.is_admin:
        if user_data.is_active is not None and not user_data.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate an admin account. Remove admin privileges first."
            )
        if user_data.is_admin is not None and not user_data.is_admin:
            # Check if this is the last admin
            admin_count = db.query(User).filter(User.is_admin == True, User.is_active == True).count()
            if admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot remove admin privileges from the last admin account."
                )

    if user_data.email is not None and user_data.email != user.email:
        changes["email"] = {"old": user.email, "new": user_data.email}
        user.email = user_data.email
    if user_data.full_name is not None and user_data.full_name != user.full_name:
        changes["full_name"] = {"old": user.full_name, "new": user_data.full_name}
        user.full_name = user_data.full_name
    if user_data.is_admin is not None:
        user.is_admin = user_data.is_admin
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    if user_data.password is not None:
        from backend.core.security import get_password_hash
        user.password_hash = get_password_hash(user_data.password)
        user.token_version += 1  # Invalidate all existing tokens

    db.commit()
    db.refresh(user)

    ip_address = request.client.host if request.client else None

    # Create specific audit logs for important changes
    if user_data.password is not None:
        audit = AuditLog(
            user_id=admin.id,
            action="password_changed",
            resource_type="user",
            resource_id=user.id,
            details={"target_email": user.email, "changed_by": admin.email},
            ip_address=ip_address
        )
        db.add(audit)

    if user_data.is_admin is not None and old_is_admin != user.is_admin:
        action = "admin_granted" if user.is_admin else "admin_revoked"
        audit = AuditLog(
            user_id=admin.id,
            action=action,
            resource_type="user",
            resource_id=user.id,
            details={"target_email": user.email},
            ip_address=ip_address
        )
        db.add(audit)

    if user_data.is_active is not None and old_is_active != user.is_active:
        action = "user_activated" if user.is_active else "user_deactivated"
        audit = AuditLog(
            user_id=admin.id,
            action=action,
            resource_type="user",
            resource_id=user.id,
            details={"target_email": user.email},
            ip_address=ip_address
        )
        db.add(audit)

    # General update log
    if changes:
        audit = AuditLog(
            user_id=admin.id,
            action="user_updated",
            resource_type="user",
            resource_id=user.id,
            details={"target_email": user.email, "changes": changes},
            ip_address=ip_address
        )
        db.add(audit)

    db.commit()

    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
        groups=[ug.group.name for ug in user.groups]
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: str, db: DbSession, admin: AdminUser, request: Request):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent deleting admin accounts
    if user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete an admin account. Remove admin privileges first."
        )

    # Audit log before deletion
    audit = AuditLog(
        user_id=admin.id,
        action="user_deleted",
        resource_type="user",
        resource_id=user.id,
        details={"email": user.email, "full_name": user.full_name},
        ip_address=request.client.host if request.client else None
    )
    db.add(audit)

    db.delete(user)
    db.commit()
