from datetime import datetime
from sqlalchemy import String, DateTime, Integer, ForeignKey, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base


class SensorData(Base):
    __tablename__ = "sensor_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    site_id: Mapped[str] = mapped_column(String(36), ForeignKey("sites.id"), nullable=False, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)  # All parameter values as JSON
    record_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    site: Mapped["Site"] = relationship("Site", back_populates="sensor_data")

    # Composite index for efficient time-range queries
    __table_args__ = (
        Index("idx_sensor_data_site_timestamp", "site_id", "timestamp", unique=True),
    )
