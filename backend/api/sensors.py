from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query
from backend.core.dependencies import DbSession, AccessContext
from backend.schemas.sensor import SensorDataResponse, SensorDataPoint
from backend.models import SensorData, Site

router = APIRouter()


@router.get("/data", response_model=SensorDataResponse)
def get_sensor_data(
    db: DbSession,
    access: AccessContext,
    sites: list[str] = Query(..., description="Site codes to query"),
    parameters: list[str] = Query(..., description="Parameter names to retrieve"),
    start: datetime | None = Query(None, description="Start datetime"),
    end: datetime | None = Query(None, description="End datetime")
):
    """Get sensor data for specified sites and parameters."""
    # Validate user has access to all requested sites
    for site_code in sites:
        access.require_site_access(site_code=site_code)

    # Default to last 7 days if no range specified
    if end is None:
        end = datetime.utcnow()
    if start is None:
        start = end - timedelta(days=7)

    # Get site IDs from codes
    site_records = db.query(Site).filter(Site.site_code.in_(sites)).all()
    site_id_map = {s.site_code: s.id for s in site_records}
    site_ids = list(site_id_map.values())

    # Query sensor data
    query = db.query(SensorData).filter(
        SensorData.site_id.in_(site_ids),
        SensorData.timestamp >= start,
        SensorData.timestamp <= end
    ).order_by(SensorData.timestamp)

    data_records = query.all()

    # Build response
    data_points = []
    for record in data_records:
        # Get site code from site_id
        site_code = next((code for code, sid in site_id_map.items() if sid == record.site_id), None)
        if not site_code:
            continue

        # Extract requested parameters from JSON data
        values = {}
        for param in parameters:
            values[param] = record.data.get(param)

        data_points.append(SensorDataPoint(
            timestamp=record.timestamp,
            site_code=site_code,
            values=values
        ))

    return SensorDataResponse(
        data=data_points,
        sites=sites,
        parameters=parameters,
        count=len(data_points)
    )


@router.get("/latest")
def get_latest_data(
    db: DbSession,
    access: AccessContext,
    sites: list[str] = Query(..., description="Site codes to query")
):
    """Get the most recent data point for each site."""
    # Validate user has access to all requested sites
    for site_code in sites:
        access.require_site_access(site_code=site_code)

    site_records = db.query(Site).filter(Site.site_code.in_(sites)).all()
    site_id_map = {s.id: s.site_code for s in site_records}

    results = {}
    for site_id, site_code in site_id_map.items():
        latest = db.query(SensorData).filter(
            SensorData.site_id == site_id
        ).order_by(SensorData.timestamp.desc()).first()

        if latest:
            results[site_code] = {
                "timestamp": latest.timestamp,
                "data": latest.data
            }

    return results
