"""Box integration API endpoints."""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from backend.config import settings
from backend.core.dependencies import DbSession, AdminUser
from backend.services.box_integration import BoxService, is_box_configured


def check_demo_mode():
    """Raise an error if running in demo mode."""
    if settings.demo_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Box Integration is disabled in demo mode"
        )
from backend.services.box_worker import (
    run_box_sync, get_sync_status, update_sync_schedule,
    start_scheduler, stop_scheduler
)
from backend.models import AuditLog


router = APIRouter()


# Request/Response models
class OAuthCallbackRequest(BaseModel):
    code: str
    state: str


class FolderConfigRequest(BaseModel):
    staging_folder_id: str
    staging_folder_name: str
    processed_folder_id: str
    processed_folder_name: str
    sync_interval_minutes: int = 60


class ConnectionStatus(BaseModel):
    is_configured: bool
    is_connected: bool
    is_active: bool
    box_user_name: Optional[str] = None
    box_user_email: Optional[str] = None
    staging_folder_name: Optional[str] = None
    processed_folder_name: Optional[str] = None
    sync_interval_minutes: int = 60
    last_sync: Optional[str] = None
    last_sync_status: Optional[str] = None
    last_sync_message: Optional[str] = None
    files_processed_count: int = 0
    # Backup config
    backup_folder_id: Optional[str] = None
    backup_folder_name: Optional[str] = None
    backup_enabled: bool = False
    backup_schedule: Optional[str] = None
    backup_time: Optional[str] = None
    last_backup: Optional[str] = None
    last_backup_status: Optional[str] = None
    last_backup_message: Optional[str] = None


class BackupConfigRequest(BaseModel):
    backup_folder_id: str
    backup_folder_name: str
    backup_enabled: bool = True
    backup_schedule: str = "manual"  # manual, daily, weekly
    backup_time: Optional[str] = None  # HH:MM format for scheduled backups


@router.get("/status")
def get_box_status(admin: AdminUser, db: DbSession) -> ConnectionStatus:
    """Get Box connection status including backup configuration."""
    box_service = BoxService(db)
    connection = box_service.get_connection()

    if not connection:
        return ConnectionStatus(
            is_configured=is_box_configured(),
            is_connected=False,
            is_active=False
        )

    return ConnectionStatus(
        is_configured=is_box_configured(),
        is_connected=True,
        is_active=connection.is_active,
        box_user_name=connection.box_user_name,
        box_user_email=connection.box_user_email,
        staging_folder_name=connection.staging_folder_name,
        processed_folder_name=connection.processed_folder_name,
        sync_interval_minutes=connection.sync_interval_minutes,
        last_sync=connection.last_sync.isoformat() if connection.last_sync else None,
        last_sync_status=connection.last_sync_status,
        last_sync_message=connection.last_sync_message,
        files_processed_count=connection.files_processed_count,
        # Backup fields
        backup_folder_id=connection.backup_folder_id,
        backup_folder_name=connection.backup_folder_name,
        backup_enabled=connection.backup_enabled,
        backup_schedule=connection.backup_schedule,
        backup_time=connection.backup_time,
        last_backup=connection.last_backup.isoformat() if connection.last_backup else None,
        last_backup_status=connection.last_backup_status,
        last_backup_message=connection.last_backup_message
    )


@router.get("/auth-url")
def get_auth_url(admin: AdminUser, db: DbSession):
    """Get Box OAuth authorization URL."""
    check_demo_mode()
    if not is_box_configured():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Box OAuth not configured. Set BOX_CLIENT_ID and BOX_CLIENT_SECRET in .env"
        )

    box_service = BoxService(db)
    try:
        result = box_service.get_oauth_url()
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/callback")
def oauth_callback(request: OAuthCallbackRequest, admin: AdminUser, db: DbSession):
    """Handle Box OAuth callback - exchange code for tokens."""
    check_demo_mode()
    box_service = BoxService(db)

    try:
        connection = box_service.exchange_code(request.code, request.state)

        # Log audit event
        audit = AuditLog(
            user_id=admin.id,
            action='box_connect',
            resource_type='box_connection',
            resource_id=connection.id,
            details={
                'box_user_email': connection.box_user_email,
                'box_user_name': connection.box_user_name
            }
        )
        db.add(audit)
        db.commit()

        return {
            'success': True,
            'message': f'Connected to Box as {connection.box_user_name}',
            'user_name': connection.box_user_name,
            'user_email': connection.box_user_email
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/folders")
def list_folders(admin: AdminUser, db: DbSession, folder_id: str = '0'):
    """List folders in Box (for folder picker)."""
    box_service = BoxService(db)

    try:
        folders = box_service.list_folders(folder_id)
        return {'folders': folders, 'parent_id': folder_id}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/configure")
def configure_folders(request: FolderConfigRequest, admin: AdminUser, db: DbSession):
    """Configure Box folders for staging and processed files."""
    check_demo_mode()
    box_service = BoxService(db)

    try:
        connection = box_service.update_folder_config(
            staging_folder_id=request.staging_folder_id,
            staging_folder_name=request.staging_folder_name,
            processed_folder_id=request.processed_folder_id,
            processed_folder_name=request.processed_folder_name,
            sync_interval_minutes=request.sync_interval_minutes
        )

        # Update scheduler with new interval
        update_sync_schedule(request.sync_interval_minutes)

        # Log audit event
        audit = AuditLog(
            user_id=admin.id,
            action='box_configure',
            resource_type='box_connection',
            resource_id=connection.id,
            details={
                'staging_folder': request.staging_folder_name,
                'processed_folder': request.processed_folder_name,
                'sync_interval': request.sync_interval_minutes
            }
        )
        db.add(audit)
        db.commit()

        return {
            'success': True,
            'message': 'Box folders configured successfully',
            'is_active': connection.is_active
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/disconnect")
def disconnect_box(admin: AdminUser, db: DbSession):
    """Disconnect Box account."""
    check_demo_mode()
    box_service = BoxService(db)

    # Log before disconnect to capture connection details
    connection = box_service.get_connection()
    if connection:
        audit = AuditLog(
            user_id=admin.id,
            action='box_disconnect',
            resource_type='box_connection',
            resource_id=connection.id,
            details={
                'box_user_email': connection.box_user_email
            }
        )
        db.add(audit)

    if box_service.disconnect():
        # Stop scheduler
        stop_scheduler()
        db.commit()
        return {'success': True, 'message': 'Box disconnected'}

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No Box connection found")


@router.post("/sync")
def trigger_sync(admin: AdminUser, db: DbSession):
    """Manually trigger Box sync."""
    check_demo_mode()
    status_info = get_sync_status()

    if not status_info.get('is_connected'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Box connection available"
        )

    if not status_info.get('is_active'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Box connection not active. Please configure folders first."
        )

    # Log sync trigger
    box_service = BoxService(db)
    connection = box_service.get_connection()
    if connection:
        audit = AuditLog(
            user_id=admin.id,
            action='box_sync_manual',
            resource_type='box_connection',
            resource_id=connection.id
        )
        db.add(audit)
        db.commit()

    # Run sync
    result = run_box_sync(force=True)

    return result


@router.get("/sync-status")
def get_current_sync_status(admin: AdminUser, db: DbSession):
    """Get current sync worker status."""
    return get_sync_status()


@router.get("/logs")
def get_sync_logs(admin: AdminUser, db: DbSession, limit: int = 20):
    """Get recent sync logs."""
    box_service = BoxService(db)
    logs = box_service.get_sync_logs(limit)

    return {
        'logs': [
            {
                'id': log.id,
                'started_at': log.started_at.isoformat() if log.started_at else None,
                'completed_at': log.completed_at.isoformat() if log.completed_at else None,
                'status': log.status,
                'files_found': log.files_found,
                'files_processed': log.files_processed,
                'files_failed': log.files_failed,
                'records_imported': log.records_imported,
                'error_message': log.error_message
            }
            for log in logs
        ]
    }


# ============== Database Backup to Box ==============

@router.post("/backup/configure")
def configure_backup(request: BackupConfigRequest, admin: AdminUser, db: DbSession):
    """Configure database backup to Box."""
    check_demo_mode()
    box_service = BoxService(db)
    connection = box_service.get_connection()

    if not connection:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Box connection available. Please connect to Box first."
        )

    # Update backup configuration
    connection.backup_folder_id = request.backup_folder_id
    connection.backup_folder_name = request.backup_folder_name
    connection.backup_enabled = request.backup_enabled
    connection.backup_schedule = request.backup_schedule
    connection.backup_time = request.backup_time

    db.commit()

    # Update backup scheduler if enabled
    from backend.services.box_worker import update_backup_schedule
    if request.backup_enabled and request.backup_schedule != "manual":
        update_backup_schedule(request.backup_schedule, request.backup_time)
    else:
        # Disable backup scheduler
        update_backup_schedule(None, None)

    # Audit log
    audit = AuditLog(
        user_id=admin.id,
        action='backup_configured',
        resource_type='box_connection',
        resource_id=connection.id,
        details={
            'backup_folder': request.backup_folder_name,
            'schedule': request.backup_schedule,
            'enabled': request.backup_enabled
        }
    )
    db.add(audit)
    db.commit()

    return {
        'success': True,
        'message': 'Backup configuration saved',
        'backup_enabled': connection.backup_enabled,
        'backup_schedule': connection.backup_schedule
    }


@router.post("/backup/run")
def run_backup(admin: AdminUser, db: DbSession):
    """Manually trigger database backup to Box."""
    check_demo_mode()
    box_service = BoxService(db)
    connection = box_service.get_connection()

    if not connection:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Box connection available"
        )

    if not connection.backup_folder_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Backup folder not configured. Please select a backup folder first."
        )

    # Run backup
    from backend.services.box_worker import run_database_backup
    result = run_database_backup(triggered_by=admin.email)

    # Audit log
    audit = AuditLog(
        user_id=admin.id,
        action='backup_manual',
        resource_type='database',
        details={
            'status': result.get('status'),
            'backup_folder': connection.backup_folder_name,
            'filename': result.get('filename')
        }
    )
    db.add(audit)
    db.commit()

    return result


@router.delete("/backup/configure")
def disable_backup(admin: AdminUser, db: DbSession):
    """Disable database backup to Box."""
    check_demo_mode()
    box_service = BoxService(db)
    connection = box_service.get_connection()

    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Box connection found"
        )

    # Clear backup configuration
    connection.backup_folder_id = None
    connection.backup_folder_name = None
    connection.backup_enabled = False
    connection.backup_schedule = None
    connection.backup_time = None

    db.commit()

    # Disable backup scheduler
    from backend.services.box_worker import update_backup_schedule
    update_backup_schedule(None, None)

    # Audit log
    audit = AuditLog(
        user_id=admin.id,
        action='backup_disabled',
        resource_type='box_connection',
        resource_id=connection.id
    )
    db.add(audit)
    db.commit()

    return {'success': True, 'message': 'Backup disabled'}
