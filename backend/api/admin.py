from datetime import datetime
from io import StringIO
import csv
from fastapi import APIRouter, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, cast, String, func
from backend.core.dependencies import DbSession, AdminUser
from backend.schemas.admin import (
    AuditLogResponse, SystemStatsResponse, SiteCreate, SiteUpdate, SystemInfoResponse
)
from backend.database import is_database_encrypted
from backend.config import settings
from backend.schemas.site import SiteResponse
from backend.models import (
    User, Group, Site, Crop, AuditLog, SensorData,
    EquipmentGroup, Parameter
)

router = APIRouter()


@router.get("/stats", response_model=SystemStatsResponse)
def get_system_stats(db: DbSession, admin: AdminUser):
    return SystemStatsResponse(
        total_users=db.query(User).count(),
        active_users=db.query(User).filter(User.is_active == True).count(),
        total_groups=db.query(Group).count(),
        total_sites=db.query(Site).count(),
        active_sites=db.query(Site).filter(Site.is_active == True).count(),
        total_sensor_records=db.query(SensorData).count(),
        total_parameters=db.query(Parameter).count(),
        total_equipment_groups=db.query(EquipmentGroup).count()
    )


@router.get("/system-info", response_model=SystemInfoResponse)
def get_system_info(db: DbSession, admin: AdminUser):
    """Get system information including encryption status and data coverage."""
    encrypted = is_database_encrypted()

    # Get data coverage (oldest and newest sensor data timestamps)
    data_range = db.query(
        func.min(SensorData.timestamp),
        func.max(SensorData.timestamp)
    ).first()

    data_start = data_range[0] if data_range else None
    data_end = data_range[1] if data_range else None

    return SystemInfoResponse(
        api_version="1.0.0",
        database_type="SQLCipher" if encrypted else "SQLite",
        database_encrypted=encrypted,
        data_coverage_start=data_start,
        data_coverage_end=data_end,
        demo_mode=settings.demo_mode
    )


@router.get("/audit", response_model=list[AuditLogResponse])
def get_audit_logs(
    db: DbSession,
    admin: AdminUser,
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0),
    user_id: str | None = None,
    action: str | None = None,
    search: str | None = Query(default=None, description="Search in user email, IP address, resource type/id, and details"),
    start_date: datetime | None = Query(default=None, description="Filter logs from this date (ISO format)"),
    end_date: datetime | None = Query(default=None, description="Filter logs until this date (ISO format)")
):
    """Get audit logs with optional filtering and search."""
    query = db.query(AuditLog).order_by(AuditLog.created_at.desc())

    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if start_date:
        query = query.filter(AuditLog.created_at >= start_date)
    if end_date:
        query = query.filter(AuditLog.created_at <= end_date)

    # Get all user emails for search matching
    all_users = db.query(User).all()
    user_map = {u.id: u.email for u in all_users}
    email_to_id = {u.email.lower(): u.id for u in all_users}

    # Apply search filter
    if search:
        search_lower = search.lower()
        # First check if search matches a user email
        matching_user_ids = [uid for email, uid in email_to_id.items() if search_lower in email]

        # Build OR conditions for search
        search_conditions = [
            AuditLog.ip_address.ilike(f"%{search}%"),
            AuditLog.resource_type.ilike(f"%{search}%"),
            AuditLog.resource_id.ilike(f"%{search}%"),
            AuditLog.action.ilike(f"%{search}%"),
            cast(AuditLog.details, String).ilike(f"%{search}%"),
        ]

        # Add user_id matches if any emails matched
        if matching_user_ids:
            search_conditions.append(AuditLog.user_id.in_(matching_user_ids))

        query = query.filter(or_(*search_conditions))

    logs = query.offset(offset).limit(limit).all()

    return [
        AuditLogResponse(
            id=log.id,
            user_id=log.user_id,
            user_email=user_map.get(log.user_id) if log.user_id else None,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            details=log.details,
            ip_address=log.ip_address,
            created_at=log.created_at
        )
        for log in logs
    ]


@router.get("/audit/export")
def export_audit_logs(
    db: DbSession,
    admin: AdminUser,
    user_id: str | None = None,
    action: str | None = None,
    search: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None
):
    """Export audit logs as CSV file."""
    query = db.query(AuditLog).order_by(AuditLog.created_at.desc())

    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if start_date:
        query = query.filter(AuditLog.created_at >= start_date)
    if end_date:
        query = query.filter(AuditLog.created_at <= end_date)

    # Get all user emails for mapping
    all_users = db.query(User).all()
    user_map = {u.id: u.email for u in all_users}
    email_to_id = {u.email.lower(): u.id for u in all_users}

    # Apply search filter
    if search:
        search_lower = search.lower()
        matching_user_ids = [uid for email, uid in email_to_id.items() if search_lower in email]
        search_conditions = [
            AuditLog.ip_address.ilike(f"%{search}%"),
            AuditLog.resource_type.ilike(f"%{search}%"),
            AuditLog.resource_id.ilike(f"%{search}%"),
            AuditLog.action.ilike(f"%{search}%"),
            cast(AuditLog.details, String).ilike(f"%{search}%"),
        ]
        if matching_user_ids:
            search_conditions.append(AuditLog.user_id.in_(matching_user_ids))
        query = query.filter(or_(*search_conditions))

    logs = query.all()

    # Create CSV in memory
    output = StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow([
        "ID", "Timestamp (UTC)", "User Email", "Action", "Resource Type",
        "Resource ID", "IP Address", "Details"
    ])

    # Write data rows
    for log in logs:
        writer.writerow([
            log.id,
            log.created_at.isoformat() if log.created_at else "",
            user_map.get(log.user_id, "") if log.user_id else "",
            log.action,
            log.resource_type or "",
            log.resource_id or "",
            log.ip_address or "",
            str(log.details) if log.details else ""
        ])

    output.seek(0)

    # Generate filename with timestamp
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"audit_log_export_{timestamp}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/sites", response_model=list[SiteResponse])
def list_all_sites(db: DbSession, admin: AdminUser):
    """List all sites (including inactive) for admin management."""
    sites = db.query(Site).all()
    return [
        SiteResponse(
            id=s.id,
            site_code=s.site_code,
            name=s.name,
            crop_id=s.crop_id,
            crop_name=s.crop.display_name if s.crop else None,
            latitude=s.latitude,
            longitude=s.longitude,
            is_active=s.is_active
        )
        for s in sites
    ]


@router.post("/sites", response_model=SiteResponse, status_code=status.HTTP_201_CREATED)
def create_site(site_data: SiteCreate, db: DbSession, admin: AdminUser):
    existing = db.query(Site).filter(Site.site_code == site_data.site_code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Site with this code already exists"
        )

    crop = db.query(Crop).filter(Crop.id == site_data.crop_id).first()
    if not crop:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid crop_id"
        )

    site = Site(
        site_code=site_data.site_code,
        name=site_data.name,
        crop_id=site_data.crop_id,
        latitude=site_data.latitude,
        longitude=site_data.longitude
    )
    db.add(site)
    db.commit()
    db.refresh(site)

    # Log the action
    log = AuditLog(
        user_id=admin.id,
        action="site_created",
        resource_type="site",
        resource_id=site.id,
        details={"site_code": site.site_code, "name": site.name}
    )
    db.add(log)
    db.commit()

    return SiteResponse(
        id=site.id,
        site_code=site.site_code,
        name=site.name,
        crop_id=site.crop_id,
        crop_name=crop.display_name,
        latitude=site.latitude,
        longitude=site.longitude,
        is_active=site.is_active
    )


@router.put("/sites/{site_id}", response_model=SiteResponse)
def update_site(site_id: str, site_data: SiteUpdate, db: DbSession, admin: AdminUser):
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site not found"
        )

    if site_data.site_code is not None:
        existing = db.query(Site).filter(Site.site_code == site_data.site_code, Site.id != site_id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Site with this code already exists"
            )
        site.site_code = site_data.site_code

    if site_data.name is not None:
        site.name = site_data.name
    if site_data.crop_id is not None:
        crop = db.query(Crop).filter(Crop.id == site_data.crop_id).first()
        if not crop:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid crop_id")
        site.crop_id = site_data.crop_id
    if site_data.latitude is not None:
        site.latitude = site_data.latitude
    if site_data.longitude is not None:
        site.longitude = site_data.longitude
    if site_data.is_active is not None:
        site.is_active = site_data.is_active

    db.commit()
    db.refresh(site)

    # Log the action
    log = AuditLog(
        user_id=admin.id,
        action="site_updated",
        resource_type="site",
        resource_id=site.id,
        details={"site_code": site.site_code}
    )
    db.add(log)
    db.commit()

    return SiteResponse(
        id=site.id,
        site_code=site.site_code,
        name=site.name,
        crop_id=site.crop_id,
        crop_name=site.crop.display_name if site.crop else None,
        latitude=site.latitude,
        longitude=site.longitude,
        is_active=site.is_active
    )


@router.delete("/sites/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_site(site_id: str, db: DbSession, admin: AdminUser):
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site not found"
        )

    # Log before deletion
    log = AuditLog(
        user_id=admin.id,
        action="site_deleted",
        resource_type="site",
        resource_id=site.id,
        details={"site_code": site.site_code, "name": site.name}
    )
    db.add(log)

    db.delete(site)
    db.commit()


@router.get("/crops", response_model=list[dict])
def list_crops_admin(db: DbSession, admin: AdminUser):
    """List all crops with site counts for admin."""
    crops = db.query(Crop).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "display_name": c.display_name,
            "color": c.color,
            "site_count": db.query(Site).filter(Site.crop_id == c.id).count()
        }
        for c in crops
    ]
