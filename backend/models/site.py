import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Float, Boolean, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base


class Crop(Base):
    __tablename__ = "crops"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)  # e.g., "almonds"
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g., "Almonds"
    color: Mapped[str] = mapped_column(String(20), default="#3B82F6")  # Hex color for map markers

    # Relationships
    sites: Mapped[list["Site"]] = relationship("Site", back_populates="crop")
    equipment_groups: Mapped[list["EquipmentGroup"]] = relationship("EquipmentGroup", back_populates="crop")
    parameters: Mapped[list["Parameter"]] = relationship("Parameter", back_populates="crop")


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    site_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)  # e.g., "SITE_001"
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    crop_id: Mapped[str] = mapped_column(String(36), ForeignKey("crops.id"), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    crop: Mapped["Crop"] = relationship("Crop", back_populates="sites")
    groups: Mapped[list["GroupSite"]] = relationship("GroupSite", back_populates="site", cascade="all, delete-orphan")
    sensor_data: Mapped[list["SensorData"]] = relationship("SensorData", back_populates="site", cascade="all, delete-orphan")


class GroupSite(Base):
    __tablename__ = "group_sites"

    group_id: Mapped[str] = mapped_column(String(36), ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)
    site_id: Mapped[str] = mapped_column(String(36), ForeignKey("sites.id", ondelete="CASCADE"), primary_key=True)

    # Relationships
    group: Mapped["Group"] = relationship("Group", back_populates="sites")
    site: Mapped["Site"] = relationship("Site", back_populates="groups")


class EquipmentGroup(Base):
    __tablename__ = "equipment_groups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)  # e.g., "Soil Thermocouple"
    crop_id: Mapped[str] = mapped_column(String(36), ForeignKey("crops.id"), nullable=False)

    # Relationships
    crop: Mapped["Crop"] = relationship("Crop", back_populates="equipment_groups")
    parameters: Mapped[list["Parameter"]] = relationship("Parameter", back_populates="equipment_group")


class Parameter(Base):
    __tablename__ = "parameters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g., "TS1_2cm"
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    equipment_group_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("equipment_groups.id"), nullable=True)
    crop_id: Mapped[str] = mapped_column(String(36), ForeignKey("crops.id"), nullable=False)
    min_range: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_range: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Relationships
    equipment_group: Mapped["EquipmentGroup | None"] = relationship("EquipmentGroup", back_populates="parameters")
    crop: Mapped["Crop"] = relationship("Crop", back_populates="parameters")
