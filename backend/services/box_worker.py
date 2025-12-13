"""
Box background worker for periodic file sync.
Downloads files from Box staging folder, processes them, and moves to processed folder.
"""
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
import threading

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import BoxConnection, BoxSyncLog, AuditLog
from backend.services.box_integration import BoxService
from backend.services import pipeline_worker
from backend.config import settings


# Global scheduler instance
_scheduler: Optional[BackgroundScheduler] = None
_is_syncing = False
_sync_lock = threading.Lock()


def get_scheduler() -> BackgroundScheduler:
    """Get or create the background scheduler."""
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler()
    return _scheduler


def start_scheduler():
    """Start the background scheduler if not already running."""
    scheduler = get_scheduler()
    if not scheduler.running:
        scheduler.start()
        print("Box sync scheduler started")


def stop_scheduler():
    """Stop the background scheduler."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        print("Box sync scheduler stopped")


def update_sync_schedule(interval_minutes: int = 60):
    """Update the sync schedule interval."""
    scheduler = get_scheduler()

    # Remove existing job if any
    if scheduler.get_job('box_sync'):
        scheduler.remove_job('box_sync')

    # Add new job with updated interval
    scheduler.add_job(
        run_box_sync,
        trigger=IntervalTrigger(minutes=interval_minutes),
        id='box_sync',
        name='Box File Sync',
        replace_existing=True,
        max_instances=1
    )

    if not scheduler.running:
        start_scheduler()

    print(f"Box sync scheduled every {interval_minutes} minutes")


def run_box_sync(force: bool = False) -> dict:
    """
    Run Box sync operation.
    Downloads files from Box staging, processes them, and moves to processed folder.

    Args:
        force: If True, run even if another sync is in progress

    Returns:
        dict with sync results
    """
    global _is_syncing

    # Check if already syncing
    with _sync_lock:
        if _is_syncing and not force:
            return {'status': 'skipped', 'message': 'Sync already in progress'}
        _is_syncing = True

    result = {
        'status': 'success',
        'files_found': 0,
        'files_processed': 0,
        'files_failed': 0,
        'records_imported': 0,
        'errors': []
    }

    db = SessionLocal()
    try:
        box_service = BoxService(db)
        connection = box_service.get_connection()

        if not connection or not connection.is_active:
            result['status'] = 'skipped'
            result['message'] = 'No active Box connection'
            return result

        if not connection.staging_folder_id or not connection.processed_folder_id:
            result['status'] = 'error'
            result['message'] = 'Box folders not configured'
            return result

        # Create sync log
        sync_log = box_service.create_sync_log(connection.id)

        try:
            # List files in staging folder
            files = box_service.list_files(connection.staging_folder_id, connection)
            result['files_found'] = len(files)

            if not files:
                box_service.update_sync_log(
                    sync_log,
                    status='success',
                    files_found=0,
                    details={'message': 'No files to process'}
                )
                connection.last_sync = datetime.utcnow()
                connection.last_sync_status = 'success'
                connection.last_sync_message = 'No new files'
                db.commit()
                return result

            # Process each file
            staging_dir = Path(settings.uploads_dir) / "staging"
            staging_dir.mkdir(parents=True, exist_ok=True)

            for file_info in files:
                file_id = file_info['id']
                file_name = file_info['name']

                try:
                    # Download to local staging
                    local_path = staging_dir / f"box_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file_name}"
                    box_service.download_file(file_id, local_path, connection)

                    # Process the file using existing pipeline
                    process_result = pipeline_worker.process_single_file(db, local_path, user_id=None)

                    if process_result['status'] == 'success':
                        result['files_processed'] += 1
                        result['records_imported'] += process_result['records_imported']

                        # Move file to processed folder in Box
                        try:
                            box_service.move_file(file_id, connection.processed_folder_id, connection)
                        except Exception as move_err:
                            result['errors'].append(f"Failed to move {file_name} in Box: {str(move_err)}")
                    else:
                        result['files_failed'] += 1
                        result['errors'].append(f"{file_name}: {process_result.get('error_message', 'Unknown error')}")

                except Exception as file_err:
                    result['files_failed'] += 1
                    result['errors'].append(f"{file_name}: {str(file_err)}")

            # Update sync log
            final_status = 'success' if result['files_failed'] == 0 else 'partial'
            if result['files_processed'] == 0 and result['files_failed'] > 0:
                final_status = 'error'

            box_service.update_sync_log(
                sync_log,
                status=final_status,
                files_found=result['files_found'],
                files_processed=result['files_processed'],
                files_failed=result['files_failed'],
                records_imported=result['records_imported'],
                error_message='; '.join(result['errors'][:5]) if result['errors'] else None,
                details={'errors': result['errors']}
            )

            # Update connection status
            connection.last_sync = datetime.utcnow()
            connection.last_sync_status = final_status
            connection.last_sync_message = f"Processed {result['files_processed']}/{result['files_found']} files"
            connection.files_processed_count += result['files_processed']
            db.commit()

            result['status'] = final_status

        except Exception as e:
            box_service.update_sync_log(
                sync_log,
                status='error',
                error_message=str(e)
            )
            connection.last_sync = datetime.utcnow()
            connection.last_sync_status = 'error'
            connection.last_sync_message = str(e)
            db.commit()

            result['status'] = 'error'
            result['errors'].append(str(e))

    finally:
        db.close()
        with _sync_lock:
            _is_syncing = False

    return result


def get_sync_status() -> dict:
    """Get current sync status."""
    db = SessionLocal()
    try:
        box_service = BoxService(db)
        connection = box_service.get_connection()

        if not connection:
            return {
                'is_connected': False,
                'is_syncing': _is_syncing,
                'scheduler_running': _scheduler.running if _scheduler else False
            }

        return {
            'is_connected': True,
            'is_active': connection.is_active,
            'is_syncing': _is_syncing,
            'scheduler_running': _scheduler.running if _scheduler else False,
            'last_sync': connection.last_sync.isoformat() if connection.last_sync else None,
            'last_sync_status': connection.last_sync_status,
            'last_sync_message': connection.last_sync_message,
            'sync_interval_minutes': connection.sync_interval_minutes,
            'files_processed_total': connection.files_processed_count
        }
    finally:
        db.close()


def initialize_box_scheduler():
    """Initialize the Box scheduler based on active connection settings."""
    db = SessionLocal()
    try:
        box_service = BoxService(db)
        connection = box_service.get_connection()

        if connection and connection.is_active and connection.staging_folder_id:
            update_sync_schedule(connection.sync_interval_minutes)
            print(f"Box scheduler initialized with {connection.sync_interval_minutes} minute interval")

        # Initialize backup scheduler if configured
        if connection and connection.backup_enabled and connection.backup_schedule != "manual":
            update_backup_schedule(connection.backup_schedule, connection.backup_time)
            print(f"Backup scheduler initialized: {connection.backup_schedule}")
    finally:
        db.close()


# ============== Database Backup Functions ==============

_backup_scheduler: Optional[BackgroundScheduler] = None


def get_backup_scheduler() -> BackgroundScheduler:
    """Get or create the backup scheduler."""
    global _backup_scheduler
    if _backup_scheduler is None:
        _backup_scheduler = BackgroundScheduler()
    return _backup_scheduler


def update_backup_schedule(schedule: Optional[str], backup_time: Optional[str]):
    """Update or disable the backup schedule."""
    scheduler = get_backup_scheduler()

    # Remove existing backup job if any
    if scheduler.get_job('database_backup'):
        scheduler.remove_job('database_backup')

    if schedule is None or schedule == "manual":
        print("Backup scheduler disabled")
        return

    # Parse backup time (default to 02:00 if not specified)
    hour = 2
    minute = 0
    if backup_time:
        try:
            parts = backup_time.split(':')
            hour = int(parts[0])
            minute = int(parts[1]) if len(parts) > 1 else 0
        except (ValueError, IndexError):
            pass

    # Configure trigger based on schedule
    if schedule == "daily":
        from apscheduler.triggers.cron import CronTrigger
        trigger = CronTrigger(hour=hour, minute=minute)
        print(f"Backup scheduled daily at {hour:02d}:{minute:02d}")
    elif schedule == "weekly":
        from apscheduler.triggers.cron import CronTrigger
        # Weekly on Sunday
        trigger = CronTrigger(day_of_week='sun', hour=hour, minute=minute)
        print(f"Backup scheduled weekly on Sunday at {hour:02d}:{minute:02d}")
    else:
        print(f"Unknown backup schedule: {schedule}")
        return

    scheduler.add_job(
        run_database_backup,
        trigger=trigger,
        id='database_backup',
        name='Database Backup to Box',
        replace_existing=True,
        max_instances=1
    )

    if not scheduler.running:
        scheduler.start()


def run_database_backup(triggered_by: str = "scheduler") -> dict:
    """
    Run database backup to Box.

    Copies the encrypted SQLite database to the configured Box backup folder.
    """
    result = {
        'status': 'success',
        'message': '',
        'filename': None,
        'triggered_by': triggered_by
    }

    db = SessionLocal()
    try:
        box_service = BoxService(db)
        connection = box_service.get_connection()

        if not connection:
            result['status'] = 'error'
            result['message'] = 'No Box connection available'
            return result

        if not connection.backup_folder_id:
            result['status'] = 'error'
            result['message'] = 'Backup folder not configured'
            return result

        # Get database file path
        db_path = Path(settings.database_url.replace("sqlite:///", ""))

        if not db_path.exists():
            result['status'] = 'error'
            result['message'] = 'Database file not found'
            return result

        # Generate backup filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_filename = f"csg_dashboard_backup_{timestamp}.db"

        try:
            # Upload to Box
            box_service.upload_file(
                file_path=db_path,
                folder_id=connection.backup_folder_id,
                filename=backup_filename,
                connection=connection
            )

            result['status'] = 'success'
            result['message'] = f'Backup uploaded successfully: {backup_filename}'
            result['filename'] = backup_filename

            # Update connection status
            connection.last_backup = datetime.utcnow()
            connection.last_backup_status = 'success'
            connection.last_backup_message = f'Uploaded {backup_filename}'
            db.commit()

        except Exception as e:
            result['status'] = 'error'
            result['message'] = f'Upload failed: {str(e)}'

            # Update connection status
            connection.last_backup = datetime.utcnow()
            connection.last_backup_status = 'error'
            connection.last_backup_message = str(e)
            db.commit()

    finally:
        db.close()

    return result
