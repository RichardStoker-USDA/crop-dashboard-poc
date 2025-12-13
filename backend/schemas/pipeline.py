"""Pipeline schemas for file upload and processing."""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class FileInfo(BaseModel):
    """Information about a file in staging or processed folder."""
    filename: str
    size: int
    modified: datetime
    status: str  # staging, processing, processed, error


class FileUploadResponse(BaseModel):
    """Response after uploading a file."""
    filename: str
    size: int
    message: str


class ProcessingResult(BaseModel):
    """Result of processing a single file."""
    filename: str
    status: str  # success, error
    records_imported: int
    records_skipped: int
    records_duplicate: int
    error_message: Optional[str] = None
    processing_time: float  # seconds


class PipelineStatus(BaseModel):
    """Overall pipeline status."""
    staging_files: list[FileInfo]
    processed_files: list[FileInfo]
    is_processing: bool
    last_run: Optional[datetime] = None


class ProcessRequest(BaseModel):
    """Request to process specific files."""
    filenames: Optional[list[str]] = None  # None = process all staging files


class DatabaseExportResponse(BaseModel):
    """Response for database export."""
    filename: str
    size: int
    tables: dict[str, int]  # table name -> row count
    created_at: datetime


class DatabaseImportRequest(BaseModel):
    """Request for database import confirmation."""
    confirm: bool = False
