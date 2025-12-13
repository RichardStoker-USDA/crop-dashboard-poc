import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from backend.config import settings
from backend.database import init_db, engine
from backend.api import api_router
from backend.core.rate_limit import limiter


def print_startup_banner():
    """Print the application startup banner."""
    banner = """
\033[38;5;34m╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                                ║
║        ██████╗██████╗  ██████╗ ██████╗                                         ║
║       ██╔════╝██╔══██╗██╔═══██╗██╔══██╗                                        ║
║       ██║     ██████╔╝██║   ██║██████╔╝                                        ║
║       ██║     ██╔══██╗██║   ██║██╔═══╝                                         ║
║       ╚██████╗██║  ██║╚██████╔╝██║                                             ║
║        ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝                                             ║
║                                                                                ║
║       ███████╗███████╗███╗   ██╗███████╗██╗███╗   ██╗ ██████╗                  ║
║       ██╔════╝██╔════╝████╗  ██║██╔════╝██║████╗  ██║██╔════╝                  ║
║       ███████╗█████╗  ██╔██╗ ██║███████╗██║██╔██╗ ██║██║  ███╗                 ║
║       ╚════██║██╔══╝  ██║╚██╗██║╚════██║██║██║╚██╗██║██║   ██║                 ║
║       ███████║███████╗██║ ╚████║███████║██║██║ ╚████║╚██████╔╝                 ║
║       ╚══════╝╚══════╝╚═╝  ╚═══╝╚══════╝╚═╝╚═╝  ╚═══╝ ╚═════╝                  ║
║                                                                                ║
║        ██████╗ ██████╗  ██████╗ ██╗   ██╗██████╗                               ║
║       ██╔════╝ ██╔══██╗██╔═══██╗██║   ██║██╔══██╗                              ║
║       ██║  ███╗██████╔╝██║   ██║██║   ██║██████╔╝                              ║
║       ██║   ██║██╔══██╗██║   ██║██║   ██║██╔═══╝                               ║
║       ╚██████╔╝██║  ██║╚██████╔╝╚██████╔╝██║                                   ║
║        ╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝                                   ║
║                                                                                ║
╠════════════════════════════════════════════════════════════════════════════════╣\033[0m
\033[38;5;250m║                       \033[1mCSG Flux Dashboard v1.0\033[0m\033[38;5;250m                                ║
║                 Agricultural Sensor Data Platform                              ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║  \033[38;5;75mDashboard Logic\033[0m\033[38;5;250m   Audrey Petrosian & Mina Swintek                           ║
║                   Crop Sensing Group · UC Davis                                ║
║                                                                                ║
║  \033[38;5;75mStack Development\033[0m\033[38;5;250m Richard Stoker                                            ║
║                   IT Specialist · USDA Agricultural Research Service          ║
║                   Davis, California · richard.stoker@usda.gov                  ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝\033[0m
"""
    print(banner)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print_startup_banner()

    if settings.demo_mode:
        print("=" * 50)
        print("  RUNNING IN DEMO MODE")
        print("  Data will reset on restart")
        print("=" * 50)
        # In demo mode, always delete and recreate the database
        db_path = Path(settings.database_url.replace("sqlite:///", ""))
        if db_path.exists():
            db_path.unlink()
            print(f"Deleted existing database: {db_path}")

    init_db()
    seed_initial_data()

    # Initialize Box scheduler if connection exists (only in production mode)
    if not settings.demo_mode:
        from backend.services.box_worker import initialize_box_scheduler, stop_scheduler
        try:
            initialize_box_scheduler()
        except Exception as e:
            print(f"Warning: Failed to initialize Box scheduler: {e}")

    yield

    # Shutdown
    if not settings.demo_mode:
        try:
            from backend.services.box_worker import stop_scheduler
            stop_scheduler()
        except Exception:
            pass


app = FastAPI(
    title=settings.app_name,
    description="Agricultural sensor data dashboard for crop monitoring",
    version="1.0.0",
    lifespan=lifespan
)

# Add rate limiter to app state
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """Handle rate limit exceeded errors."""
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please try again later."}
    )


# CORS middleware - use all_cors_origins to include HF Spaces URL when deployed
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.all_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(api_router, prefix="/api")


def seed_initial_data():
    """Seed the database with initial admin user and minimal test data."""
    from backend.database import SessionLocal
    from backend.models import User, Crop, Site, Group, GroupSite, UserGroup
    from backend.services.auth import get_user_by_email, create_user

    db = SessionLocal()
    try:
        # Check if database is empty (for production mode)
        user_count = db.query(User).count()
        if user_count > 0 and not settings.demo_mode:
            print("Database already seeded, skipping...")
            return

        # Create admin user if not exists
        admin = get_user_by_email(db, settings.admin_email)
        if not admin:
            admin = create_user(
                db,
                email=settings.admin_email,
                password=settings.admin_password,
                full_name="System Administrator",
                is_admin=True
            )
            print(f"Created admin user: {settings.admin_email}")

        # Create a single test crop
        test_crop = db.query(Crop).filter(Crop.name == "test_crop").first()
        if not test_crop:
            test_crop = Crop(
                name="test_crop",
                display_name="Test Crop",
                color="#6B7280"
            )
            db.add(test_crop)
            db.commit()
            db.refresh(test_crop)

        # Create a single test site (can be deleted after setup)
        test_site = db.query(Site).filter(Site.site_code == "TEST_001").first()
        if not test_site:
            test_site = Site(
                site_code="TEST_001",
                name="Test Site",
                crop_id=test_crop.id,
                latitude=38.5449,
                longitude=-121.7405
            )
            db.add(test_site)
            db.commit()
            db.refresh(test_site)

        # Create a test group with access to the test site
        test_group = db.query(Group).filter(Group.name == "Test Group").first()
        if not test_group:
            test_group = Group(
                name="Test Group",
                description="Example group - can be deleted after adding your own"
            )
            db.add(test_group)
            db.commit()
            db.refresh(test_group)

            # Add test site to test group
            gs = GroupSite(group_id=test_group.id, site_id=test_site.id)
            db.add(gs)
            db.commit()

        # Create a test standard user (can be deleted after setup)
        test_user = get_user_by_email(db, "testuser@example.com")
        if not test_user:
            test_user = create_user(
                db,
                email="testuser@example.com",
                password="testpass123",
                full_name="Test Standard User",
                is_admin=False
            )
            # Assign to test group
            ug = UserGroup(user_id=test_user.id, group_id=test_group.id, role="viewer")
            db.add(ug)
            db.commit()
            print("Created test user: testuser@example.com")

        print("Database seeded with minimal test data")
        print("Note: Test site, group, and user can be deleted after adding your own")

    finally:
        db.close()


@app.get("/health")
def health_check():
    return {"status": "healthy", "app": settings.app_name, "demo_mode": settings.demo_mode}


@app.get("/api/config/mode")
def get_config_mode():
    """Return configuration mode for frontend."""
    return {
        "demo_mode": settings.demo_mode,
        "enable_splash_screen": settings.enable_splash_screen
    }


# Serve static files (frontend) if they exist - must be after all API routes
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    # Serve static assets directory
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # Catch-all route for SPA - must be last
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve frontend SPA files."""
        # Try to serve the exact file first
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        # Return index.html for all other routes (SPA routing)
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        # Fallback
        return {"error": "Not found"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
