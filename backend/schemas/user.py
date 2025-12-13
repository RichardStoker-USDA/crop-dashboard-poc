from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    is_admin: bool = False


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
    is_admin: bool | None = None
    is_active: bool | None = None
    password: str | None = None


class UserResponse(UserBase):
    id: str
    is_active: bool
    created_at: datetime
    last_login: datetime | None = None
    groups: list[str] = []  # List of group names

    class Config:
        from_attributes = True


class UserInDB(UserBase):
    id: str
    password_hash: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
