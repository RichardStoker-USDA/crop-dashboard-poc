"""
Centralized Access Control Module

This module provides a single source of truth for all access control logic.
It computes a user's accessible resources ONCE per request and caches them
in a UserAccessContext object that can be injected into any endpoint.

Usage in endpoints:
    from backend.core.dependencies import DbSession, AccessContext

    @router.get("/data")
    def get_data(access: AccessContext, db: DbSession):
        if not access.is_admin:
            # Filter by user's accessible sites
            query = query.filter(Model.site_id.in_(access.site_ids))
        return query.all()

Adding new data types:
    1. If data is site-scoped: use access.site_ids or access.site_codes
    2. If data is crop-scoped: use access.crop_ids
    3. If data needs new scope: add new field to UserAccessContext

Author: Richard Stoker <richard.stoker@usda.gov>
        IT Specialist, Agricultural Research Service, USDA
"""

from dataclasses import dataclass
from typing import Annotated
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.core.dependencies import get_current_user
from backend.models import User, UserGroup, GroupSite, Site


@dataclass
class UserAccessContext:
    """
    Cached access context for a user request.

    This object is created ONCE per request and contains all the information
    needed to filter data by the user's group memberships.

    Attributes:
        user: The authenticated User object
        is_admin: Whether user has admin privileges (bypasses all filters)
        site_ids: Set of Site.id values the user can access
        site_codes: Set of Site.site_code values the user can access
        crop_ids: Set of Crop.id values from the user's accessible sites
    """
    user: User
    is_admin: bool
    site_ids: set[str]
    site_codes: set[str]
    crop_ids: set[str]

    def has_site_access(self, site_id: str = None, site_code: str = None) -> bool:
        """Check if user has access to a specific site."""
        if self.is_admin:
            return True
        if site_id:
            return site_id in self.site_ids
        if site_code:
            return site_code in self.site_codes
        return False

    def has_crop_access(self, crop_id: str) -> bool:
        """Check if user has access to a specific crop (via their sites)."""
        if self.is_admin:
            return True
        return crop_id in self.crop_ids

    def require_site_access(self, site_id: str = None, site_code: str = None) -> None:
        """Raise 403 if user doesn't have access to the site."""
        if not self.has_site_access(site_id=site_id, site_code=site_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this site"
            )

    def require_crop_access(self, crop_id: str) -> None:
        """Raise 403 if user doesn't have access to the crop."""
        if not self.has_crop_access(crop_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this crop"
            )


def get_access_context(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
) -> UserAccessContext:
    """
    FastAPI dependency that creates a UserAccessContext for the current request.

    This is computed ONCE per request and cached by FastAPI's dependency system.
    All endpoints that inject AccessContext will receive the same instance.

    For admins: Returns context with is_admin=True (no filtering needed)
    For regular users: Queries their group memberships and accessible sites
    """
    if user.is_admin:
        # Admin users see everything - query all active sites
        sites = db.query(Site).filter(Site.is_active == True).all()
        site_ids = {s.id for s in sites}
        site_codes = {s.site_code for s in sites}
        crop_ids = {s.crop_id for s in sites if s.crop_id}

        return UserAccessContext(
            user=user,
            is_admin=True,
            site_ids=site_ids,
            site_codes=site_codes,
            crop_ids=crop_ids
        )

    # Regular user - filter by group membership
    # Step 1: Get user's group IDs
    user_groups = db.query(UserGroup).filter(UserGroup.user_id == user.id).all()
    group_ids = [ug.group_id for ug in user_groups]

    if not group_ids:
        # User has no groups - empty access
        return UserAccessContext(
            user=user,
            is_admin=False,
            site_ids=set(),
            site_codes=set(),
            crop_ids=set()
        )

    # Step 2: Get site IDs from those groups
    group_sites = db.query(GroupSite).filter(GroupSite.group_id.in_(group_ids)).all()
    site_ids_list = [gs.site_id for gs in group_sites]

    if not site_ids_list:
        # Groups have no sites assigned
        return UserAccessContext(
            user=user,
            is_admin=False,
            site_ids=set(),
            site_codes=set(),
            crop_ids=set()
        )

    # Step 3: Get actual site objects (only active ones)
    sites = db.query(Site).filter(
        Site.id.in_(site_ids_list),
        Site.is_active == True
    ).all()

    site_ids = {s.id for s in sites}
    site_codes = {s.site_code for s in sites}
    crop_ids = {s.crop_id for s in sites if s.crop_id}

    return UserAccessContext(
        user=user,
        is_admin=False,
        site_ids=site_ids,
        site_codes=site_codes,
        crop_ids=crop_ids
    )


# Type alias for dependency injection - use this in endpoint signatures
AccessContext = Annotated[UserAccessContext, Depends(get_access_context)]
