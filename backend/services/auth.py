from datetime import datetime
from sqlalchemy.orm import Session
from backend.models import User, UserGroup, GroupSite
from backend.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token
from backend.schemas.auth import Token


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def create_token_for_user(db: Session, user: User) -> Token:
    # Get user's groups
    user_groups = db.query(UserGroup).filter(UserGroup.user_id == user.id).all()
    group_ids = [ug.group_id for ug in user_groups]

    # Get sites accessible through user's groups
    if user.is_admin:
        # Admin can see all sites
        from backend.models import Site
        sites = db.query(Site).filter(Site.is_active == True).all()
        site_codes = [s.site_code for s in sites]
    else:
        # Regular user can only see sites from their groups
        group_sites = db.query(GroupSite).filter(GroupSite.group_id.in_(group_ids)).all()
        site_ids = [gs.site_id for gs in group_sites]
        from backend.models import Site
        sites = db.query(Site).filter(Site.id.in_(site_ids), Site.is_active == True).all()
        site_codes = [s.site_code for s in sites]

    # Common token data
    token_data = {
        "sub": user.id,
        "email": user.email,
        "is_admin": user.is_admin,
        "groups": group_ids,
        "sites": site_codes,
        "token_version": user.token_version,
    }

    # Create both tokens
    access_token = create_access_token(data=token_data)

    # Refresh token only needs user ID and token_version for validation
    refresh_data = {
        "sub": user.id,
        "token_version": user.token_version,
    }
    refresh_token = create_refresh_token(data=refresh_data)

    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()

    return Token(access_token=access_token, refresh_token=refresh_token)


def create_user(
    db: Session,
    email: str,
    password: str,
    full_name: str,
    is_admin: bool = False
) -> User:
    password_hash = get_password_hash(password)
    user = User(
        email=email,
        password_hash=password_hash,
        full_name=full_name,
        is_admin=is_admin
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()
