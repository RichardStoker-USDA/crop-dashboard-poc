"""Box cloud storage connection model."""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Boolean, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class BoxConnection(Base):
    """Store Box OAuth tokens and folder configuration."""
    __tablename__ = "box_connections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), default="Box Connection")

    # OAuth tokens - stored in database which MUST be encrypted via SQLCipher.
    # Never run this app with an unencrypted database as it stores private credentials.
    access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Box user info
    box_user_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    box_user_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    box_user_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Folder configuration
    staging_folder_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    staging_folder_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    processed_folder_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    processed_folder_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Sync settings
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    sync_interval_minutes: Mapped[int] = mapped_column(Integer, default=60)
    last_sync: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_sync_status: Mapped[str | None] = mapped_column(String(50), nullable=True)  # success, error, in_progress
    last_sync_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    files_processed_count: Mapped[int] = mapped_column(Integer, default=0)

    # Database backup settings
    backup_folder_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    backup_folder_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    backup_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    backup_schedule: Mapped[str | None] = mapped_column(String(50), nullable=True)  # manual, daily, weekly
    backup_time: Mapped[str | None] = mapped_column(String(10), nullable=True)  # HH:MM format for scheduled backups
    last_backup: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_backup_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    last_backup_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BoxSyncLog(Base):
    """Log of Box sync operations."""
    __tablename__ = "box_sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    connection_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="in_progress")  # in_progress, success, error
    files_found: Mapped[int] = mapped_column(Integer, default=0)
    files_processed: Mapped[int] = mapped_column(Integer, default=0)
    files_failed: Mapped[int] = mapped_column(Integer, default=0)
    records_imported: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
