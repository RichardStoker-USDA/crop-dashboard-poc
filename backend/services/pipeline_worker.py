"""
Pipeline worker for processing CSI datalogger files.
Handles file upload, validation, processing, and archival.
"""
import os
import shutil
import time
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Optional
import pandas as pd
from sqlalchemy.orm import Session

from backend.models import Site, SensorData, FileArchive, AuditLog
from backend.config import settings


# Paths
UPLOAD_BASE = Path(settings.uploads_dir)
STAGING_DIR = UPLOAD_BASE / "staging"
PROCESSED_DIR = UPLOAD_BASE / "processed"

# Ensure directories exist
STAGING_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# Processing state
_is_processing = False
_last_run: Optional[datetime] = None


def get_file_hash(filepath: Path) -> str:
    """Calculate SHA256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            sha256.update(chunk)
    return sha256.hexdigest()


def list_staging_files() -> list[dict]:
    """List all files in the staging directory."""
    files = []
    for f in STAGING_DIR.iterdir():
        if f.is_file() and f.suffix.lower() == '.csv':
            stat = f.stat()
            files.append({
                'filename': f.name,
                'size': stat.st_size,
                'modified': datetime.fromtimestamp(stat.st_mtime),
                'status': 'staging'
            })
    return sorted(files, key=lambda x: x['modified'], reverse=True)


def list_processed_files() -> list[dict]:
    """List all files in the processed directory."""
    files = []
    for f in PROCESSED_DIR.iterdir():
        if f.is_file() and f.suffix.lower() == '.csv':
            stat = f.stat()
            files.append({
                'filename': f.name,
                'size': stat.st_size,
                'modified': datetime.fromtimestamp(stat.st_mtime),
                'status': 'processed'
            })
    return sorted(files, key=lambda x: x['modified'], reverse=True)


def validate_csv_file(filepath: Path) -> tuple[bool, str]:
    """
    Validate that a CSV file is a valid CSI datalogger format.
    Returns (is_valid, error_message).
    """
    try:
        # Try reading with CSI format (skip metadata rows)
        df = pd.read_csv(
            filepath,
            header=[0],
            skiprows=[0, 2, 3] if _is_csi_format(filepath) else None,
            sep=',',
            na_values="NAN",
            engine='python',
            nrows=10  # Just check first few rows
        )

        # Check for required columns
        if 'TIMESTAMP' not in df.columns:
            return False, "Missing TIMESTAMP column"
        if 'Site' not in df.columns:
            return False, "Missing Site column"

        return True, ""
    except Exception as e:
        return False, str(e)


def _is_csi_format(filepath: Path) -> bool:
    """Check if file is CSI datalogger format by looking at first line."""
    try:
        with open(filepath, 'r') as f:
            first_line = f.readline()
            return first_line.startswith('"TOA5"') or first_line.startswith('TOA5')
    except Exception:
        return False


def process_single_file(
    db: Session,
    filepath: Path,
    user_id: Optional[str] = None
) -> dict:
    """
    Process a single CSV file and import data to database.
    Returns processing result dict.
    """
    start_time = time.time()
    result = {
        'filename': filepath.name,
        'status': 'error',
        'records_imported': 0,
        'records_skipped': 0,
        'records_duplicate': 0,
        'error_message': None,
        'processing_time': 0.0
    }

    try:
        # Validate file
        is_valid, error = validate_csv_file(filepath)
        if not is_valid:
            result['error_message'] = f"Validation failed: {error}"
            return result

        # Get file hash for deduplication tracking
        file_hash = get_file_hash(filepath)

        # Check if already processed
        existing_archive = db.query(FileArchive).filter(
            FileArchive.file_hash == file_hash
        ).first()
        if existing_archive and existing_archive.status == 'completed':
            result['error_message'] = "File already processed (duplicate hash)"
            result['status'] = 'duplicate'
            return result

        # Create or update archive record
        if existing_archive:
            archive = existing_archive
            archive.status = 'processing'
        else:
            archive = FileArchive(
                original_filename=filepath.name,
                file_hash=file_hash,
                file_size=filepath.stat().st_size,
                status='processing'
            )
            db.add(archive)
        db.commit()

        # Read the CSV
        is_csi = _is_csi_format(filepath)
        if is_csi:
            df = pd.read_csv(
                filepath,
                header=[0],
                skiprows=[0, 2, 3],
                sep=',',
                na_values="NAN",
                engine='python',
                low_memory=False
            )
        else:
            df = pd.read_csv(filepath, low_memory=False)

        # Get site mapping
        sites = db.query(Site).all()
        site_map = {s.site_code: s.id for s in sites}

        # Columns to exclude from data JSON
        exclude_cols = {'TIMESTAMP', 'Site', 'RECORD', 'Unnamed: 0'}
        data_cols = [c for c in df.columns if c not in exclude_cols]

        imported = 0
        skipped = 0
        duplicates = 0

        for idx, row in df.iterrows():
            site_code = row.get('Site')
            if pd.isna(site_code) or site_code not in site_map:
                skipped += 1
                continue

            try:
                timestamp = pd.to_datetime(row['TIMESTAMP'])
            except Exception:
                skipped += 1
                continue

            site_id = site_map[site_code]
            ts = timestamp.to_pydatetime()

            # Check for existing record (upsert logic)
            existing = db.query(SensorData).filter(
                SensorData.site_id == site_id,
                SensorData.timestamp == ts
            ).first()

            if existing:
                duplicates += 1
                continue

            # Build data dict
            data = {}
            for col in data_cols:
                val = row[col]
                if pd.notna(val):
                    if hasattr(val, 'item'):
                        val = val.item()
                    data[col] = val

            # Apply QA/QC filters (like original)
            # Skip bad values
            if data.get('LW_IN', 0) < -10000000:
                skipped += 1
                continue

            record_num = row.get('RECORD')
            if pd.notna(record_num):
                record_num = int(record_num)
            else:
                record_num = None

            sensor_data = SensorData(
                site_id=site_id,
                timestamp=ts,
                data=data,
                record_number=record_num
            )
            db.add(sensor_data)
            imported += 1

            # Batch commit
            if imported % 500 == 0:
                db.commit()

        db.commit()

        # Update archive record
        archive.status = 'completed'
        archive.processed_date = datetime.utcnow()
        archive.records_imported = imported

        # Move file to processed
        processed_path = PROCESSED_DIR / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filepath.name}"
        archive.archived_path = str(processed_path)
        shutil.move(str(filepath), str(processed_path))

        db.commit()

        # Log audit event
        if user_id:
            audit = AuditLog(
                user_id=user_id,
                action='pipeline_import',
                resource_type='sensor_data',
                resource_id=archive.id,
                details={
                    'filename': filepath.name,
                    'records_imported': imported,
                    'records_skipped': skipped,
                    'records_duplicate': duplicates
                }
            )
            db.add(audit)
            db.commit()

        result['status'] = 'success'
        result['records_imported'] = imported
        result['records_skipped'] = skipped
        result['records_duplicate'] = duplicates

    except Exception as e:
        result['error_message'] = str(e)
        db.rollback()

        # Update archive with error
        try:
            archive = db.query(FileArchive).filter(
                FileArchive.original_filename == filepath.name
            ).first()
            if archive:
                archive.status = 'error'
                archive.error_message = str(e)
                db.commit()
        except Exception:
            pass

    result['processing_time'] = time.time() - start_time
    return result


def process_all_staging_files(
    db: Session,
    user_id: Optional[str] = None,
    filenames: Optional[list[str]] = None
) -> list[dict]:
    """
    Process all files in staging directory (or specified files).
    Returns list of processing results.
    """
    global _is_processing, _last_run

    if _is_processing:
        return [{'status': 'error', 'error_message': 'Processing already in progress'}]

    _is_processing = True
    results = []

    try:
        # Get files to process
        if filenames:
            files = [STAGING_DIR / f for f in filenames if (STAGING_DIR / f).exists()]
        else:
            files = [f for f in STAGING_DIR.iterdir() if f.is_file() and f.suffix.lower() == '.csv']

        for filepath in files:
            result = process_single_file(db, filepath, user_id)
            results.append(result)

        _last_run = datetime.utcnow()

    finally:
        _is_processing = False

    return results


def get_pipeline_status() -> dict:
    """Get current pipeline status."""
    return {
        'staging_files': list_staging_files(),
        'processed_files': list_processed_files(),
        'is_processing': _is_processing,
        'last_run': _last_run
    }


def save_uploaded_file(file_content: bytes, filename: str) -> Path:
    """Save an uploaded file to the staging directory."""
    # Sanitize filename
    safe_filename = "".join(c for c in filename if c.isalnum() or c in '._-')
    if not safe_filename.lower().endswith('.csv'):
        safe_filename += '.csv'

    # Add timestamp to avoid conflicts
    timestamped_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{safe_filename}"
    filepath = STAGING_DIR / timestamped_name

    with open(filepath, 'wb') as f:
        f.write(file_content)

    return filepath


def _is_safe_filename(filename: str) -> bool:
    """Check if filename is safe (no path traversal)."""
    # Reject path separators and parent directory references
    if '/' in filename or '\\' in filename or '..' in filename:
        return False
    # Reject empty or hidden files
    if not filename or filename.startswith('.'):
        return False
    return True


def delete_staging_file(filename: str) -> bool:
    """Delete a file from staging directory."""
    if not _is_safe_filename(filename):
        return False
    filepath = STAGING_DIR / filename
    # Verify resolved path is still within staging directory
    try:
        filepath.resolve().relative_to(STAGING_DIR.resolve())
    except ValueError:
        return False
    if filepath.exists() and filepath.is_file():
        filepath.unlink()
        return True
    return False


def delete_processed_file(filename: str) -> bool:
    """Delete a file from processed directory."""
    if not _is_safe_filename(filename):
        return False
    filepath = PROCESSED_DIR / filename
    # Verify resolved path is still within processed directory
    try:
        filepath.resolve().relative_to(PROCESSED_DIR.resolve())
    except ValueError:
        return False
    if filepath.exists() and filepath.is_file():
        filepath.unlink()
        return True
    return False
