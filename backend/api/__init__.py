from fastapi import APIRouter
from backend.api import auth, users, sites, sensors, groups, admin, pipeline, box

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(groups.router, prefix="/groups", tags=["Groups"])
api_router.include_router(sites.router, prefix="/sites", tags=["Sites"])
api_router.include_router(sensors.router, prefix="/sensors", tags=["Sensors"])
api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
api_router.include_router(pipeline.router, prefix="/pipeline", tags=["Pipeline"])
api_router.include_router(box.router, prefix="/box", tags=["Box Integration"])
