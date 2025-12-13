"""
Data import service for loading sample sensor data.
"""
import pandas as pd
from pathlib import Path
from datetime import datetime
import json
from sqlalchemy.orm import Session
from backend.models import Site, SensorData, Crop, EquipmentGroup, Parameter


def get_site_map(db: Session) -> dict[str, str]:
    """Get mapping of site_code to site_id."""
    sites = db.query(Site).all()
    return {s.site_code: s.id for s in sites}


def get_crop_map(db: Session) -> dict[str, str]:
    """Get mapping of crop_name to crop_id."""
    crops = db.query(Crop).all()
    return {c.name: c.id for c in crops}


def import_equipment_groups(db: Session, base_path: Path):
    """Import equipment groups and parameters from CSV files."""
    crop_map = get_crop_map(db)

    equipment_files = {
        "almonds": "Almond_Equipment.csv",
        "grapes": "Grape_Equipment.csv",
        "olives": "Olive_Equipment.csv",
        "pistachios": "Pistachio_Equipment.csv",
    }

    for crop_name, filename in equipment_files.items():
        filepath = base_path / "read-in-csvs" / filename
        if not filepath.exists():
            print(f"Warning: {filepath} not found, skipping")
            continue

        crop_id = crop_map.get(crop_name)
        if not crop_id:
            print(f"Warning: Crop '{crop_name}' not found in database")
            continue

        # Read CSV - row 0 is parameter names (headers), row 1 is equipment groups
        df = pd.read_csv(filepath, header=0, nrows=1)

        # Get unique equipment groups for this crop
        equipment_groups = set(df.iloc[0].values)

        # Create equipment groups
        eq_group_map = {}
        for eq_name in equipment_groups:
            if pd.isna(eq_name) or not eq_name:
                continue
            existing = db.query(EquipmentGroup).filter(
                EquipmentGroup.name == eq_name,
                EquipmentGroup.crop_id == crop_id
            ).first()
            if not existing:
                eq = EquipmentGroup(name=eq_name, crop_id=crop_id)
                db.add(eq)
                db.flush()
                eq_group_map[eq_name] = eq.id
            else:
                eq_group_map[eq_name] = existing.id

        # Create parameters
        for param_name in df.columns:
            eq_name = df.iloc[0][param_name]
            if pd.isna(eq_name):
                eq_id = None
            else:
                eq_id = eq_group_map.get(eq_name)

            existing = db.query(Parameter).filter(
                Parameter.name == param_name,
                Parameter.crop_id == crop_id
            ).first()
            if not existing:
                param = Parameter(
                    name=param_name,
                    display_name=param_name.replace("_", " ").title(),
                    crop_id=crop_id,
                    equipment_group_id=eq_id
                )
                db.add(param)

        db.commit()
        print(f"Imported equipment groups for {crop_name}")

    # Also add equipment groups for table_grapes (copy from grapes)
    grapes_id = crop_map.get("grapes")
    table_grapes_id = crop_map.get("table_grapes")
    if grapes_id and table_grapes_id:
        grape_eqs = db.query(EquipmentGroup).filter(EquipmentGroup.crop_id == grapes_id).all()
        for eq in grape_eqs:
            existing = db.query(EquipmentGroup).filter(
                EquipmentGroup.name == eq.name,
                EquipmentGroup.crop_id == table_grapes_id
            ).first()
            if not existing:
                new_eq = EquipmentGroup(name=eq.name, crop_id=table_grapes_id)
                db.add(new_eq)

        grape_params = db.query(Parameter).filter(Parameter.crop_id == grapes_id).all()
        for param in grape_params:
            existing = db.query(Parameter).filter(
                Parameter.name == param.name,
                Parameter.crop_id == table_grapes_id
            ).first()
            if not existing:
                # Find equipment group ID for table grapes
                eq_id = None
                if param.equipment_group:
                    new_eq = db.query(EquipmentGroup).filter(
                        EquipmentGroup.name == param.equipment_group.name,
                        EquipmentGroup.crop_id == table_grapes_id
                    ).first()
                    if new_eq:
                        eq_id = new_eq.id

                new_param = Parameter(
                    name=param.name,
                    display_name=param.display_name,
                    crop_id=table_grapes_id,
                    equipment_group_id=eq_id
                )
                db.add(new_param)
        db.commit()
        print("Copied equipment groups to table_grapes")


def import_sensor_data_from_csv(
    db: Session,
    csv_path: Path,
    site_map: dict[str, str],
    batch_size: int = 500
) -> int:
    """Import sensor data from a CSV file."""
    print(f"Reading {csv_path.name}...")

    # Read CSV
    df = pd.read_csv(csv_path, low_memory=False)

    # Check for required columns
    if "TIMESTAMP" not in df.columns:
        print(f"Error: TIMESTAMP column not found in {csv_path}")
        return 0
    if "Site" not in df.columns:
        print(f"Error: Site column not found in {csv_path}")
        return 0

    # Columns to exclude from data JSON
    exclude_cols = {"TIMESTAMP", "Site", "RECORD", "Unnamed: 0"}
    data_cols = [c for c in df.columns if c not in exclude_cols]

    imported = 0
    skipped = 0
    duplicates = 0

    for idx, row in df.iterrows():
        site_code = row.get("Site")
        if pd.isna(site_code) or site_code not in site_map:
            skipped += 1
            continue

        try:
            timestamp = pd.to_datetime(row["TIMESTAMP"])
        except Exception:
            skipped += 1
            continue

        site_id = site_map[site_code]
        ts = timestamp.to_pydatetime()

        # Check for existing record
        existing = db.query(SensorData).filter(
            SensorData.site_id == site_id,
            SensorData.timestamp == ts
        ).first()

        if existing:
            duplicates += 1
            continue

        # Build data dict with all sensor values
        data = {}
        for col in data_cols:
            val = row[col]
            if pd.notna(val):
                # Convert numpy types to Python types
                if hasattr(val, 'item'):
                    val = val.item()
                data[col] = val

        record_num = row.get("RECORD")
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

        if imported % 500 == 0:
            db.commit()
            if imported % 2000 == 0:
                print(f"  Imported {imported} records...")

    db.commit()
    print(f"  Completed: {imported} imported, {duplicates} duplicates, {skipped} skipped")
    return imported


def import_all_sample_data(db: Session, original_repo_path: str):
    """Import all sample data from the original repo."""
    base_path = Path(original_repo_path)
    sample_path = base_path / "sample-data"

    if not sample_path.exists():
        raise FileNotFoundError(f"Sample data path not found: {sample_path}")

    # Import equipment groups first
    print("\n=== Importing Equipment Groups ===")
    import_equipment_groups(db, base_path)

    # Get site mapping
    site_map = get_site_map(db)
    print(f"\nFound {len(site_map)} sites in database")

    # Import sensor data from each CSV
    print("\n=== Importing Sensor Data ===")
    csv_files = ["trex_data.csv", "matt_data.csv", "lynn_data.csv"]
    total = 0

    for csv_file in csv_files:
        csv_path = sample_path / csv_file
        if csv_path.exists():
            count = import_sensor_data_from_csv(db, csv_path, site_map)
            total += count
        else:
            print(f"Warning: {csv_path} not found")

    print(f"\n=== Import Complete ===")
    print(f"Total records imported: {total}")
    return total


if __name__ == "__main__":
    # Run as standalone script
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))

    from backend.database import SessionLocal, init_db

    init_db()
    db = SessionLocal()

    try:
        original_repo = "/Users/rich/Dev/cropdash/crop-dashboard"
        import_all_sample_data(db, original_repo)
    finally:
        db.close()
