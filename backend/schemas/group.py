from datetime import datetime
from pydantic import BaseModel


class GroupBase(BaseModel):
    name: str
    description: str | None = None


class GroupCreate(GroupBase):
    pass


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class GroupMemberResponse(BaseModel):
    user_id: str
    email: str
    full_name: str
    role: str

    class Config:
        from_attributes = True


class GroupSiteResponse(BaseModel):
    site_id: str
    site_code: str
    site_name: str

    class Config:
        from_attributes = True


class GroupResponse(GroupBase):
    id: str
    created_at: datetime
    updated_at: datetime
    member_count: int = 0
    site_count: int = 0

    class Config:
        from_attributes = True


class GroupDetailResponse(GroupResponse):
    members: list[GroupMemberResponse] = []
    sites: list[GroupSiteResponse] = []


class AssignUserToGroupRequest(BaseModel):
    user_id: str
    role: str = "viewer"  # viewer, editor, manager


class AssignSiteToGroupRequest(BaseModel):
    site_id: str
