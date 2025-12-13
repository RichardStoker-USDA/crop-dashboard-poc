from datetime import datetime
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    user_id: str | None
    user_email: str | None = None
    action: str
    resource_type: str | None
    resource_id: str | None
    details: dict | None
    ip_address: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class SystemStatsResponse(BaseModel):
    total_users: int
    active_users: int
    total_groups: int
    total_sites: int
    active_sites: int
    total_sensor_records: int
    total_parameters: int
    total_equipment_groups: int


class SiteCreate(BaseModel):
    site_code: str
    name: str
    crop_id: str
    latitude: float
    longitude: float


class SiteUpdate(BaseModel):
    site_code: str | None = None
    name: str | None = None
    crop_id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    is_active: bool | None = None


class SystemInfoResponse(BaseModel):
    api_version: str
    database_type: str
    database_encrypted: bool
    data_coverage_start: datetime | None
    data_coverage_end: datetime | None
    demo_mode: bool
