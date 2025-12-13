# CSG Flux Dashboard

A web-based dashboard for visualizing and managing agricultural sensor data from CSI dataloggers. This platform provides a production-ready interface built around the data processing pipeline developed by the [Crop Sensing Group](https://github.com/crop-sensing) at UC Davis.

The core dashboard logic and sensor data pipeline were created by [Audrey Petrosian](https://github.com/ucpetrosian) and [Mina Swintek](https://github.com/mswintek).

## Features

- Real-time sensor data visualization with interactive charts
- Multi-site monitoring with group-based access control
- CSV data ingestion pipeline for CSI datalogger files
- Box cloud storage integration for automated file sync
- Database backup and restore functionality
- Role-based user management (admin/user roles)
- Light/dark theme support

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy, SQLCipher
- **Frontend**: React, TypeScript, Vite, TailwindCSS
- **Database**: SQLite with SQLCipher encryption

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Conda/Miniforge (recommended for environment management)

### Setup

1. Clone the repository

2. Create and activate conda environment:
```bash
conda create -p /path/to/environments/cropdash_env python=3.11
conda activate /path/to/environments/cropdash_env
```

3. Install backend dependencies:
```bash
cd backend
pip install -r requirements.txt
```

4. Install frontend dependencies:
```bash
cd frontend
npm install
```

5. Copy the example environment file and configure:
```bash
cp .env.example .env
```

6. Start the development servers:
```bash
# Terminal 1 - Backend
uvicorn backend.main:app --reload

# Terminal 2 - Frontend
cd frontend && npm run dev
```

The app will be available at `http://localhost:5173`

## Default Accounts

On first run, the app creates these accounts:

| Account | Email | Password | Notes |
|---------|-------|----------|-------|
| Admin | `admin@cropdash.dev` | `changeme123` | Full access, change password after first login |
| Test User | `testuser@example.com` | `testpass123` | Standard user with limited access, can be deleted |

A test site and group are also created to demonstrate how access control works. These can be deleted once you've added your own sites and users.

## Configuration

### Required Environment Variables

Create a `.env` file in the project root with these settings:

```bash
# Security (REQUIRED for production)
SECRET_KEY=your-secret-key-min-32-chars
REFRESH_SECRET_KEY=your-refresh-secret-key-min-32-chars
DB_ENCRYPTION_KEY=your-database-encryption-key

# Admin account
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-password

# Box integration (optional)
BOX_CLIENT_ID=your-box-client-id
BOX_CLIENT_SECRET=your-box-client-secret

# Splash screen (optional, disabled by default)
ENABLE_SPLASH_SCREEN=true
```

### Splash Screen

The splash screen video animation is disabled by default. To enable it:

1. Set `ENABLE_SPLASH_SCREEN=true` in your `.env` file
2. Place your video file at `frontend/public/videos/splash.mp4`

Keep the video file small (under 5MB recommended) for fast loading.

### Security Notes

- **SECRET_KEY / REFRESH_SECRET_KEY**: Used for JWT token signing. Generate strong random keys (32+ characters). If not set, random keys are generated on startup which will invalidate sessions on restart.

- **DB_ENCRYPTION_KEY**: Enables SQLCipher database encryption. This should always be set as the database stores sensitive information including OAuth tokens and user credentials.

- Never commit `.env` files to version control.

## Project Structure

```
crop-dashboard-platform/
├── backend/           # FastAPI application
│   ├── api/          # Route handlers
│   ├── core/         # Auth, security, dependencies
│   ├── models/       # SQLAlchemy models
│   ├── schemas/      # Pydantic schemas
│   └── services/     # Business logic
├── frontend/         # React SPA
│   └── src/
│       ├── components/
│       ├── pages/
│       └── stores/
├── data/             # SQLite database (gitignored)
├── uploads/          # File staging (gitignored)
└── archives/         # Backups (gitignored)
```

## License

For research and educational use.
