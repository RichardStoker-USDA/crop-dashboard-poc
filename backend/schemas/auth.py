from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str | None = None  # Optional - can also be read from httpOnly cookie


class TokenPayload(BaseModel):
    sub: str  # user_id
    email: str
    is_admin: bool
    groups: list[str]  # group_ids
    sites: list[str]  # site_codes the user can access
    exp: int
