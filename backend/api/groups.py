from fastapi import APIRouter, HTTPException, status, Request
from backend.core.dependencies import DbSession, AdminUser
from backend.schemas.group import (
    GroupCreate, GroupUpdate, GroupResponse, GroupDetailResponse,
    GroupMemberResponse, GroupSiteResponse,
    AssignUserToGroupRequest, AssignSiteToGroupRequest
)
from backend.models import Group, User, Site, UserGroup, GroupSite, AuditLog

router = APIRouter()


@router.get("", response_model=list[GroupResponse])
def list_groups(db: DbSession, admin: AdminUser):
    groups = db.query(Group).all()
    return [
        GroupResponse(
            id=g.id,
            name=g.name,
            description=g.description,
            created_at=g.created_at,
            updated_at=g.updated_at,
            member_count=len(g.members),
            site_count=len(g.sites)
        )
        for g in groups
    ]


@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
def create_group(group_data: GroupCreate, db: DbSession, admin: AdminUser, request: Request):
    existing = db.query(Group).filter(Group.name == group_data.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group with this name already exists"
        )
    group = Group(name=group_data.name, description=group_data.description)
    db.add(group)
    db.commit()
    db.refresh(group)

    # Audit log
    audit = AuditLog(
        user_id=admin.id,
        action="group_created",
        resource_type="group",
        resource_id=group.id,
        details={"name": group.name, "description": group.description},
        ip_address=request.client.host if request.client else None
    )
    db.add(audit)
    db.commit()

    return GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        created_at=group.created_at,
        updated_at=group.updated_at,
        member_count=0,
        site_count=0
    )


@router.get("/{group_id}", response_model=GroupDetailResponse)
def get_group(group_id: str, db: DbSession, admin: AdminUser):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )

    members = [
        GroupMemberResponse(
            user_id=ug.user.id,
            email=ug.user.email,
            full_name=ug.user.full_name,
            role=ug.role
        )
        for ug in group.members
    ]

    sites = [
        GroupSiteResponse(
            site_id=gs.site.id,
            site_code=gs.site.site_code,
            site_name=gs.site.name
        )
        for gs in group.sites
    ]

    return GroupDetailResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        created_at=group.created_at,
        updated_at=group.updated_at,
        member_count=len(members),
        site_count=len(sites),
        members=members,
        sites=sites
    )


@router.put("/{group_id}", response_model=GroupResponse)
def update_group(group_id: str, group_data: GroupUpdate, db: DbSession, admin: AdminUser, request: Request):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )

    changes = {}
    old_name = group.name

    if group_data.name is not None:
        # Check for duplicate name
        existing = db.query(Group).filter(Group.name == group_data.name, Group.id != group_id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Group with this name already exists"
            )
        if group_data.name != group.name:
            changes["name"] = {"old": group.name, "new": group_data.name}
        group.name = group_data.name
    if group_data.description is not None:
        if group_data.description != group.description:
            changes["description"] = {"old": group.description, "new": group_data.description}
        group.description = group_data.description

    db.commit()
    db.refresh(group)

    # Audit log
    if changes:
        audit = AuditLog(
            user_id=admin.id,
            action="group_updated",
            resource_type="group",
            resource_id=group.id,
            details={"group_name": old_name, "changes": changes},
            ip_address=request.client.host if request.client else None
        )
        db.add(audit)
        db.commit()

    return GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        created_at=group.created_at,
        updated_at=group.updated_at,
        member_count=len(group.members),
        site_count=len(group.sites)
    )


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(group_id: str, db: DbSession, admin: AdminUser, request: Request):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )

    # Audit log before deletion
    audit = AuditLog(
        user_id=admin.id,
        action="group_deleted",
        resource_type="group",
        resource_id=group.id,
        details={"name": group.name, "member_count": len(group.members), "site_count": len(group.sites)},
        ip_address=request.client.host if request.client else None
    )
    db.add(audit)

    db.delete(group)
    db.commit()


@router.post("/{group_id}/users", status_code=status.HTTP_201_CREATED)
def assign_user_to_group(group_id: str, data: AssignUserToGroupRequest, db: DbSession, admin: AdminUser, request: Request):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = db.query(UserGroup).filter(
        UserGroup.user_id == data.user_id,
        UserGroup.group_id == group_id
    ).first()

    action = "user_role_updated" if existing else "user_assigned_to_group"
    old_role = existing.role if existing else None

    if existing:
        existing.role = data.role
    else:
        ug = UserGroup(user_id=data.user_id, group_id=group_id, role=data.role)
        db.add(ug)

    db.commit()

    # Audit log
    details = {
        "user_email": user.email,
        "group_name": group.name,
        "role": data.role
    }
    if old_role:
        details["old_role"] = old_role

    audit = AuditLog(
        user_id=admin.id,
        action=action,
        resource_type="user_group",
        resource_id=f"{user.id}:{group.id}",
        details=details,
        ip_address=request.client.host if request.client else None
    )
    db.add(audit)
    db.commit()

    return {"message": "User assigned to group"}


@router.delete("/{group_id}/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_user_from_group(group_id: str, user_id: str, db: DbSession, admin: AdminUser, request: Request):
    ug = db.query(UserGroup).filter(
        UserGroup.user_id == user_id,
        UserGroup.group_id == group_id
    ).first()
    if not ug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not in group")

    # Get names for audit log
    user = db.query(User).filter(User.id == user_id).first()
    group = db.query(Group).filter(Group.id == group_id).first()

    # Audit log before deletion
    audit = AuditLog(
        user_id=admin.id,
        action="user_removed_from_group",
        resource_type="user_group",
        resource_id=f"{user_id}:{group_id}",
        details={
            "user_email": user.email if user else user_id,
            "group_name": group.name if group else group_id,
            "role": ug.role
        },
        ip_address=request.client.host if request.client else None
    )
    db.add(audit)

    db.delete(ug)
    db.commit()


@router.post("/{group_id}/sites", status_code=status.HTTP_201_CREATED)
def assign_site_to_group(group_id: str, data: AssignSiteToGroupRequest, db: DbSession, admin: AdminUser, request: Request):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    site = db.query(Site).filter(Site.id == data.site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")

    existing = db.query(GroupSite).filter(
        GroupSite.site_id == data.site_id,
        GroupSite.group_id == group_id
    ).first()

    if existing:
        return {"message": "Site already in group"}

    gs = GroupSite(site_id=data.site_id, group_id=group_id)
    db.add(gs)
    db.commit()

    # Audit log
    audit = AuditLog(
        user_id=admin.id,
        action="site_assigned_to_group",
        resource_type="group_site",
        resource_id=f"{group.id}:{site.id}",
        details={
            "site_code": site.site_code,
            "site_name": site.name,
            "group_name": group.name
        },
        ip_address=request.client.host if request.client else None
    )
    db.add(audit)
    db.commit()

    return {"message": "Site assigned to group"}


@router.delete("/{group_id}/sites/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_site_from_group(group_id: str, site_id: str, db: DbSession, admin: AdminUser, request: Request):
    gs = db.query(GroupSite).filter(
        GroupSite.site_id == site_id,
        GroupSite.group_id == group_id
    ).first()
    if not gs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not in group")

    # Get names for audit log
    site = db.query(Site).filter(Site.id == site_id).first()
    group = db.query(Group).filter(Group.id == group_id).first()

    # Audit log before deletion
    audit = AuditLog(
        user_id=admin.id,
        action="site_removed_from_group",
        resource_type="group_site",
        resource_id=f"{group_id}:{site_id}",
        details={
            "site_code": site.site_code if site else site_id,
            "site_name": site.name if site else None,
            "group_name": group.name if group else group_id
        },
        ip_address=request.client.host if request.client else None
    )
    db.add(audit)

    db.delete(gs)
    db.commit()
