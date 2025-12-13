from datetime import datetime
from pydantic import BaseModel


class SensorDataQuery(BaseModel):
    sites: list[str]  # site_codes
    parameters: list[str]  # parameter names
    start: datetime | None = None
    end: datetime | None = None


class SensorDataPoint(BaseModel):
    timestamp: datetime
    site_code: str
    values: dict[str, float | None]  # parameter_name -> value


class SensorDataResponse(BaseModel):
    data: list[SensorDataPoint]
    sites: list[str]
    parameters: list[str]
    count: int
