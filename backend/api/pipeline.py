"""Pipeline API endpoints for file upload and processing."""
from fastapi import APIRouter, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse, StreamingResponse
from typing import Optional
import shutil
import io
from datetime import datetime
from pathlib import Path

from backend.core.dependencies import DbSession, AdminUser
from backend.schemas.pipeline import (
    FileInfo, FileUploadResponse, ProcessingResult,
    PipelineStatus, ProcessRequest, DatabaseExportResponse
)
from backend.services import pipeline_worker
from backend.config import settings
from backend.models import User, Group, Site, SensorData, AuditLog, FileArchive


router = APIRouter()


@router.get("/status", response_model=PipelineStatus)
def get_pipeline_status(admin: AdminUser):
    """Get current pipeline status including staging and processed files."""
    status_data = pipeline_worker.get_pipeline_status()
    return PipelineStatus(
        staging_files=[FileInfo(**f) for f in status_data['staging_files']],
        processed_files=[FileInfo(**f) for f in status_data['processed_files']],
        is_processing=status_data['is_processing'],
        last_run=status_data['last_run']
    )


@router.post("/upload", response_model=FileUploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    admin: AdminUser = None,
    db: DbSession = None
):
    """Upload a CSV file to the staging directory."""
    # Validate file type
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are allowed"
        )

    # Read file content
    content = await file.read()

    # Check file size (max 100MB)
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 100MB"
        )

    # Save to staging
    filepath = pipeline_worker.save_uploaded_file(content, file.filename)

    # Log audit event
    audit = AuditLog(
        user_id=admin.id,
        action='file_upload',
        resource_type='pipeline',
        details={'filename': filepath.name, 'size': len(content)}
    )
    db.add(audit)
    db.commit()

    return FileUploadResponse(
        filename=filepath.name,
        size=len(content),
        message="File uploaded to staging successfully"
    )


@router.post("/process", response_model=list[ProcessingResult])
def process_files(
    request: ProcessRequest,
    admin: AdminUser,
    db: DbSession
):
    """Process files from staging directory."""
    results = pipeline_worker.process_all_staging_files(
        db,
        user_id=admin.id,
        filenames=request.filenames
    )

    return [ProcessingResult(**r) for r in results]


@router.delete("/staging/{filename}")
def delete_staging_file(filename: str, admin: AdminUser, db: DbSession):
    """Delete a file from staging directory."""
    if pipeline_worker.delete_staging_file(filename):
        # Log audit
        audit = AuditLog(
            user_id=admin.id,
            action='file_delete',
            resource_type='staging',
            details={'filename': filename}
        )
        db.add(audit)
        db.commit()
        return {"message": f"Deleted {filename} from staging"}

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="File not found in staging"
    )


@router.delete("/processed/{filename}")
def delete_processed_file(filename: str, admin: AdminUser, db: DbSession):
    """Delete a file from processed directory."""
    if pipeline_worker.delete_processed_file(filename):
        # Log audit
        audit = AuditLog(
            user_id=admin.id,
            action='file_delete',
            resource_type='processed',
            details={'filename': filename}
        )
        db.add(audit)
        db.commit()
        return {"message": f"Deleted {filename} from processed"}

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="File not found in processed"
    )


@router.get("/database/export")
def export_database(admin: AdminUser, db: DbSession):
    """Export the entire database as a downloadable SQLite file."""
    # Get database path
    db_path = Path(settings.database_url.replace("sqlite:///", ""))

    if not db_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Database file not found"
        )

    # Get table counts for metadata - dynamically query all tables
    from sqlalchemy import inspect, text
    inspector = inspect(db.get_bind())
    table_names = inspector.get_table_names()
    table_counts = {}
    for table_name in sorted(table_names):
        # Validate table name contains only safe characters (alphanumeric and underscore)
        if not table_name.replace('_', '').isalnum():
            continue
        # Use identifier quoting for safety
        result = db.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
        table_counts[table_name] = result.scalar()

    # Log audit
    audit = AuditLog(
        user_id=admin.id,
        action='database_export',
        resource_type='database',
        details={'table_counts': table_counts}
    )
    db.add(audit)
    db.commit()

    # Return file as download
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"csg_dashboard_backup_{timestamp}.db"

    return FileResponse(
        path=str(db_path),
        filename=filename,
        media_type='application/octet-stream'
    )


@router.get("/database/stats")
def get_database_stats(admin: AdminUser, db: DbSession):
    """Get database statistics - dynamically lists all tables."""
    db_path = Path(settings.database_url.replace("sqlite:///", ""))

    # Dynamically get all table counts
    from sqlalchemy import inspect, text
    inspector = inspect(db.get_bind())
    table_names = inspector.get_table_names()
    tables = {}
    for table_name in sorted(table_names):
        # Validate table name contains only safe characters (alphanumeric and underscore)
        if not table_name.replace('_', '').isalnum():
            continue
        # Use identifier quoting for safety
        result = db.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
        tables[table_name] = result.scalar()

    stats = {
        'file_size': db_path.stat().st_size if db_path.exists() else 0,
        'tables': tables
    }
    return stats


@router.post("/database/import")
async def import_database(
    file: UploadFile = File(...),
    admin: AdminUser = None,
    db: DbSession = None
):
    """
    Import/restore a database from a backup file.
    WARNING: This will replace ALL existing data!
    Supports both encrypted (SQLCipher) and unencrypted SQLite databases.
    """
    # Validate file type
    if not file.filename or not file.filename.lower().endswith('.db'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .db files are allowed"
        )

    # Read file content
    content = await file.read()

    # Validate file size (must be at least 100 bytes for a valid SQLCipher db)
    if len(content) < 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too small to be a valid database"
        )

    # Only accept encrypted (SQLCipher) databases
    # Unencrypted SQLite files start with "SQLite format 3" - reject these
    if content.startswith(b'SQLite format 3'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unencrypted database not allowed. Only encrypted (SQLCipher) backups can be imported."
        )

    # Get database path
    db_path = Path(settings.database_url.replace("sqlite:///", ""))

    # Create backup of current database
    backup_path = db_path.parent / f"pre_import_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    if db_path.exists():
        shutil.copy(str(db_path), str(backup_path))

    # Close current connection (this is important!)
    # Note: In production, you'd want to properly close all connections
    db.close()

    try:
        # Write new database
        with open(db_path, 'wb') as f:
            f.write(content)

        return {
            "message": "Database imported successfully",
            "backup_created": str(backup_path),
            "imported_size": len(content),
            "restart_required": True
        }

    except Exception as e:
        # Restore backup on error
        if backup_path.exists():
            shutil.copy(str(backup_path), str(db_path))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import failed: {str(e)}. Original database restored."
        )
