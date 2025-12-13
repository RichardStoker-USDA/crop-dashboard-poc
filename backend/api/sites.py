from fastapi import APIRouter, HTTPException, status
from backend.core.dependencies import DbSession, AccessContext
from backend.schemas.site import SiteResponse, CropResponse, EquipmentGroupResponse, ParameterResponse
from backend.models import Site, Crop, EquipmentGroup, Parameter

router = APIRouter()


@router.get("", response_model=list[SiteResponse])
def list_sites(db: DbSession, access: AccessContext):
    """List sites accessible to the current user."""
    if access.is_admin:
        sites = db.query(Site).filter(Site.is_active == True).all()
    else:
        if not access.site_ids:
            return []
        sites = db.query(Site).filter(Site.id.in_(access.site_ids)).all()

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


@router.get("/crops", response_model=list[CropResponse])
def list_crops(db: DbSession, access: AccessContext):
    """List crops that appear in the user's accessible sites."""
    if access.is_admin:
        crops = db.query(Crop).all()
    else:
        if not access.crop_ids:
            return []
        crops = db.query(Crop).filter(Crop.id.in_(access.crop_ids)).all()

    return [CropResponse.model_validate(c) for c in crops]


@router.get("/equipment-groups", response_model=list[EquipmentGroupResponse])
def list_equipment_groups(db: DbSession, access: AccessContext, crop_id: str | None = None):
    """List equipment groups for crops accessible to the current user."""
    if access.is_admin:
        query = db.query(EquipmentGroup)
    else:
        if not access.crop_ids:
            return []
        query = db.query(EquipmentGroup).filter(EquipmentGroup.crop_id.in_(access.crop_ids))

    if crop_id:
        # Validate user has access to this crop
        if not access.is_admin and crop_id not in access.crop_ids:
            return []
        query = query.filter(EquipmentGroup.crop_id == crop_id)

    groups = query.all()
    return [EquipmentGroupResponse.model_validate(g) for g in groups]


@router.get("/parameters", response_model=list[ParameterResponse])
def list_parameters(
    db: DbSession,
    access: AccessContext,
    crop_id: str | None = None,
    equipment_group_id: str | None = None
):
    """List parameters for crops accessible to the current user."""
    if access.is_admin:
        query = db.query(Parameter)
    else:
        if not access.crop_ids:
            return []
        query = db.query(Parameter).filter(Parameter.crop_id.in_(access.crop_ids))

    if crop_id:
        # Validate user has access to this crop
        if not access.is_admin and crop_id not in access.crop_ids:
            return []
        query = query.filter(Parameter.crop_id == crop_id)

    if equipment_group_id:
        query = query.filter(Parameter.equipment_group_id == equipment_group_id)

    params = query.all()
    return [
        ParameterResponse(
            id=p.id,
            name=p.name,
            display_name=p.display_name,
            unit=p.unit,
            equipment_group_id=p.equipment_group_id,
            equipment_group_name=p.equipment_group.name if p.equipment_group else None,
            min_range=p.min_range,
            max_range=p.max_range
        )
        for p in params
    ]


@router.get("/{site_code}", response_model=SiteResponse)
def get_site(site_code: str, db: DbSession, access: AccessContext):
    """Get a specific site by code."""
    site = db.query(Site).filter(Site.site_code == site_code).first()
    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site not found"
        )

    # Use the access context to validate
    access.require_site_access(site_code=site_code)

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
