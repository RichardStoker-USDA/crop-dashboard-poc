"""
Database module with SQLCipher encryption support.

When DB_ENCRYPTION_KEY is set in the environment (or .env file), the database
will be encrypted using SQLCipher. If no key is provided, a standard SQLite
database is used (for development only).

Author: Richard Stoker <richard.stoker@usda.gov>
        IT Specialist, Agricultural Research Service, USDA
"""
import os
from pathlib import Path
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from backend.config import settings

# Check if SQLCipher is available
SQLCIPHER_AVAILABLE = False
try:
    import sqlcipher3
    SQLCIPHER_AVAILABLE = True
except ImportError:
    pass


def _get_db_path() -> str:
    """Extract the database file path from the database URL."""
    url = settings.database_url
    if url.startswith("sqlite:///"):
        path = url[10:]  # Remove "sqlite:///"
        # Handle relative paths (./data/...)
        if path.startswith("./"):
            path = path[2:]
        # Ensure directory exists
        db_dir = Path(path).parent
        db_dir.mkdir(parents=True, exist_ok=True)
        return path
    return url


def _create_encrypted_engine():
    """Create an engine using SQLCipher for encrypted database access."""
    if not SQLCIPHER_AVAILABLE:
        raise RuntimeError(
            "SQLCipher encryption requested but sqlcipher3 is not installed. "
            "Install with: pip install sqlcipher3"
        )

    db_path = _get_db_path()
    key = settings.db_encryption_key

    def create_connection():
        """Create a new SQLCipher connection."""
        conn = sqlcipher3.connect(db_path, check_same_thread=False)
        # Set the encryption key
        conn.execute(f"PRAGMA key = '{key}'")
        # Use SQLCipher 4 defaults for strong encryption
        conn.execute("PRAGMA cipher_compatibility = 4")
        conn.execute("PRAGMA kdf_iter = 256000")
        conn.execute("PRAGMA cipher_memory_security = ON")
        return conn

    # Create engine with creator function
    # Note: SQLite with creator uses StaticPool instead of QueuePool
    from sqlalchemy.pool import StaticPool
    engine = create_engine(
        "sqlite://",  # Dummy URL, we override with creator
        creator=create_connection,
        poolclass=StaticPool
    )

    return engine


def _create_standard_engine():
    """Create a standard SQLite engine (no encryption)."""
    # Ensure directory exists
    _get_db_path()

    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False}
    )
    return engine


def is_database_encrypted(db_path: str | None = None) -> bool:
    """Check if the database file is encrypted."""
    path = db_path or _get_db_path()
    if not os.path.exists(path):
        return False

    with open(path, 'rb') as f:
        header = f.read(16)

    # SQLite files start with "SQLite format 3\0"
    # Encrypted databases have random-looking headers
    return header != b'SQLite format 3\x00'


def validate_database_encryption():
    """
    Validate that the database file matches our encryption expectations.

    Raises RuntimeError if:
    - Encryption is enabled but database file is unencrypted
    - This prevents using pre-existing unencrypted databases with encrypted mode
    """
    db_path = _get_db_path()

    # Skip validation if database doesn't exist yet (will be created encrypted)
    if not os.path.exists(db_path):
        return

    # Skip validation in unencrypted dev mode
    if not settings.db_encryption_key:
        return

    # Check if existing database is encrypted
    if not is_database_encrypted(db_path):
        raise RuntimeError(
            "\n"
            "=" * 70 + "\n"
            "UNENCRYPTED DATABASE DETECTED\n"
            "=" * 70 + "\n"
            "\n"
            f"The database file '{db_path}' is NOT encrypted,\n"
            "but DB_ENCRYPTION_KEY is set. This is a security risk.\n"
            "\n"
            "This can happen if:\n"
            "  1. The database was created without encryption\n"
            "  2. You copied an unencrypted database from another source\n"
            "\n"
            "To fix this:\n"
            "  1. Delete the unencrypted database file\n"
            "  2. Restart the app to create a new encrypted database\n"
            "\n"
            "If you need to migrate data from an unencrypted database,\n"
            "use the export/import tools with proper encryption.\n"
            "=" * 70
        )


def create_db_engine():
    """
    Create the appropriate database engine based on configuration.

    If db_encryption_key is set, uses SQLCipher for encryption.
    Otherwise, requires explicit opt-in via ALLOW_UNENCRYPTED_DB=true.
    """
    if settings.db_encryption_key:
        # Validate existing database is encrypted (prevents unencrypted db attacks)
        validate_database_encryption()
        print("Database encryption enabled (SQLCipher)")
        return _create_encrypted_engine()
    else:
        # Guard rail: require explicit opt-in to run without encryption
        # IMPORTANT: Only check os.environ directly, NOT .env file
        # This prevents accidentally committing the bypass flag
        allow_unencrypted = os.environ.get("CROPDASH_DEV_ALLOW_UNENCRYPTED", "").lower() == "true"

        if not allow_unencrypted:
            raise RuntimeError(
                "\n"
                "=" * 70 + "\n"
                "DATABASE ENCRYPTION REQUIRED\n"
                "=" * 70 + "\n"
                "\n"
                "No DB_ENCRYPTION_KEY found. For security, this app requires an\n"
                "encrypted database.\n"
                "\n"
                "To fix this, add to your .env file:\n"
                "\n"
                "  DB_ENCRYPTION_KEY=<your-secure-key>\n"
                "\n"
                "Generate a key with:\n"
                "  python -c \"import secrets; print(secrets.token_urlsafe(64))\"\n"
                "\n"
                "For development ONLY (if SQLCipher is not installed), you can\n"
                "temporarily bypass this by running with:\n"
                "\n"
                "  CROPDASH_DEV_ALLOW_UNENCRYPTED=true python -m uvicorn ...\n"
                "\n"
                "This environment variable is intentionally NOT read from .env\n"
                "to prevent accidental production deployment without encryption.\n"
                "=" * 70
            )
        print("\n" + "!" * 70)
        print("WARNING: Running with UNENCRYPTED database")
        print("This mode is for development only - NEVER use in production!")
        print("!" * 70 + "\n")
        return _create_standard_engine()


# Create the engine
engine = create_db_engine()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from backend.models import user, group, site, sensor_data, pipeline, box_connection
    Base.metadata.create_all(bind=engine)
