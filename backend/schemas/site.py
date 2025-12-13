from datetime import datetime
from pydantic import BaseModel


class CropResponse(BaseModel):
    id: str
    name: str
    display_name: str
    color: str

    class Config:
        from_attributes = True


class SiteResponse(BaseModel):
    id: str
    site_code: str
    name: str
    crop_id: str
    crop_name: str | None = None
    latitude: float
    longitude: float
    is_active: bool

    class Config:
        from_attributes = True


class EquipmentGroupResponse(BaseModel):
    id: str
    name: str
    crop_id: str

    class Config:
        from_attributes = True


class ParameterResponse(BaseModel):
    id: str
    name: str
    display_name: str | None
    unit: str | None
    equipment_group_id: str | None
    equipment_group_name: str | None = None
    min_range: float | None
    max_range: float | None

    class Config:
        from_attributes = True
