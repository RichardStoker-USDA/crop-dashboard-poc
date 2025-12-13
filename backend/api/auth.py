from fastapi import APIRouter, HTTPException, status, Request, Response, Cookie
from typing import Optional
from backend.core.dependencies import DbSession, CurrentUser
from backend.schemas.auth import LoginRequest, Token, RefreshRequest
from backend.schemas.user import UserResponse
from backend.services.auth import authenticate_user, create_token_for_user
from backend.core.security import verify_refresh_token
from backend.core.rate_limit import limiter
from backend.models import User, AuditLog
from backend.config import settings

router = APIRouter()


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    """Set httpOnly cookies for authentication tokens."""
    # Access token cookie - shorter expiry
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        max_age=settings.access_token_expire_minutes * 60,
        path="/"
    )
    # Refresh token cookie - longer expiry
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        path="/api/auth"  # Only sent to auth endpoints
    )


def _clear_auth_cookies(response: Response):
    """Clear authentication cookies."""
    response.delete_cookie(
        key="access_token",
        path="/",
        domain=settings.cookie_domain
    )
    response.delete_cookie(
        key="refresh_token",
        path="/api/auth",
        domain=settings.cookie_domain
    )


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")  # Prevent brute force attacks
def login(request: Request, login_data: LoginRequest, response: Response, db: DbSession):
    user = authenticate_user(db, login_data.email, login_data.password)
    if not user:
        # Log failed login attempt
        log = AuditLog(
            action="login_failed",
            details={"email": login_data.email},
            ip_address=request.client.host if request.client else None
        )
        db.add(log)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    # Log successful login
    log = AuditLog(
        user_id=user.id,
        action="login_success",
        details={"email": user.email},
        ip_address=request.client.host if request.client else None
    )
    db.add(log)
    db.commit()

    tokens = create_token_for_user(db, user)

    # Set httpOnly cookies
    _set_auth_cookies(response, tokens.access_token, tokens.refresh_token)

    return tokens


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: CurrentUser, db: DbSession):
    # Get group names for response
    group_names = [ug.group.name for ug in current_user.groups]
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_admin=current_user.is_admin,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        last_login=current_user.last_login,
        groups=group_names
    )


@router.post("/logout")
def logout(current_user: CurrentUser, response: Response, db: DbSession):
    """Logout user by invalidating all their tokens."""
    current_user.token_version += 1
    db.commit()

    # Clear httpOnly cookies
    _clear_auth_cookies(response)

    return {"message": "Successfully logged out"}


@router.post("/refresh", response_model=Token)
@limiter.limit("10/minute")  # Prevent token refresh abuse
def refresh_token(
    request: Request,
    response: Response,
    db: DbSession,
    refresh_data: RefreshRequest = None,
    refresh_token_cookie: Optional[str] = Cookie(None, alias="refresh_token")
):
    """Exchange a valid refresh token for new access + refresh tokens."""
    # Get refresh token from body or cookie
    token = None
    if refresh_data and refresh_data.refresh_token:
        token = refresh_data.refresh_token
    elif refresh_token_cookie:
        token = refresh_token_cookie

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = verify_refresh_token(token)

    if payload is None:
        # Clear invalid cookies
        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    # Check token version - ensures refresh tokens are invalidated on password change
    token_version = payload.get("token_version")
    if token_version is None or token_version != user.token_version:
        # Clear invalid cookies
        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Generate new tokens
    tokens = create_token_for_user(db, user)

    # Set new httpOnly cookies
    _set_auth_cookies(response, tokens.access_token, tokens.refresh_token)

    return tokens
