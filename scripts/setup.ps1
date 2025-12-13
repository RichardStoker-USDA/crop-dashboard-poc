#
# CSG Flux Dashboard - Windows Setup Script
# Creates environment, installs dependencies, and starts the app
#
# Usage: .\scripts\setup.ps1 [-Dev]
#   -Dev    Development mode with hot reload (for contributors)
#

param(
    [switch]$Dev
)

$ErrorActionPreference = "Stop"

# Configuration
$AppName = "cropdash"
$EnvName = "${AppName}_env"
$PythonVersion = "3.11"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

# Colors
function Write-Header($msg) {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
}

function Write-Step($msg) {
    Write-Host "▶ $msg" -ForegroundColor Blue
}

function Write-Success($msg) {
    Write-Host "✓ $msg" -ForegroundColor Green
}

function Write-Warning($msg) {
    Write-Host "⚠ $msg" -ForegroundColor Yellow
}

function Write-Error($msg) {
    Write-Host "✗ $msg" -ForegroundColor Red
}

# Check if command exists
function Test-Command($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

# Detect Python environment manager
function Get-PythonEnvManager {
    if (Test-Command "mamba") { return "mamba" }
    if (Test-Command "conda") { return "conda" }
    if (Test-Command "python") { return "venv" }
    return "none"
}

# Install SQLCipher (Windows is tricky - we'll use pre-built wheels)
function Install-SQLCipherDeps {
    Write-Step "Checking SQLCipher availability..."

    # On Windows, sqlcipher3 pip package includes pre-built binaries
    # We'll verify after pip install
    Write-Success "SQLCipher will be installed via pip (includes Windows binaries)"
}

# Create Python environment
function New-PythonEnv {
    $envManager = Get-PythonEnvManager
    Write-Step "Creating Python environment using $envManager..."

    switch ($envManager) {
        { $_ -in "mamba", "conda" } {
            # Check if environment exists
            $envList = & $envManager env list 2>$null
            if ($envList -match "^$EnvName\s") {
                Write-Warning "Environment '$EnvName' already exists"
                $response = Read-Host "Recreate it? (y/N)"
                if ($response -eq "y" -or $response -eq "Y") {
                    & $envManager env remove -n $EnvName -y
                    & $envManager create -n $EnvName python=$PythonVersion -y
                }
            } else {
                & $envManager create -n $EnvName python=$PythonVersion -y
            }

            # Get env path
            $envInfo = & $envManager env list | Where-Object { $_ -match "^$EnvName\s" }
            $script:EnvPath = ($envInfo -split '\s+')[1]
            $script:PythonBin = Join-Path $script:EnvPath "python.exe"
            $script:PipBin = Join-Path $script:EnvPath "Scripts\pip.exe"
        }
        "venv" {
            $envPath = Join-Path $ProjectDir ".venv"
            if (Test-Path $envPath) {
                Write-Warning "Virtual environment already exists at $envPath"
                $response = Read-Host "Recreate it? (y/N)"
                if ($response -eq "y" -or $response -eq "Y") {
                    Remove-Item -Recurse -Force $envPath
                    python -m venv $envPath
                }
            } else {
                python -m venv $envPath
            }

            $script:EnvPath = $envPath
            $script:PythonBin = Join-Path $envPath "Scripts\python.exe"
            $script:PipBin = Join-Path $envPath "Scripts\pip.exe"
        }
        "none" {
            Write-Error "No Python environment manager found!"
            Write-Host ""
            Write-Host "Please install one of the following:"
            Write-Host "  - Miniforge/Mambaforge (recommended): https://github.com/conda-forge/miniforge"
            Write-Host "  - Miniconda: https://docs.conda.io/en/latest/miniconda.html"
            Write-Host "  - Python 3.11+: https://www.python.org/downloads/"
            exit 1
        }
    }

    Write-Success "Python environment ready: $script:EnvPath"
}

# Install Python dependencies
function Install-PythonDeps {
    Write-Step "Installing Python dependencies..."

    & $script:PipBin install --upgrade pip
    & $script:PipBin install -r (Join-Path $ProjectDir "backend\requirements.txt")

    # Verify SQLCipher
    $result = & $script:PythonBin -c "import sqlcipher3" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "SQLCipher Python bindings installed successfully"
    } else {
        Write-Error "Failed to install sqlcipher3 Python package"
        Write-Host ""
        Write-Host "On Windows, you may need Visual C++ Build Tools."
        Write-Host "Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/"
        exit 1
    }
}

# Check Node.js
function Test-NodeJs {
    if (-not (Test-Command "node")) {
        Write-Error "Node.js is not installed"
        Write-Host ""
        Write-Host "Please install Node.js 18+ from: https://nodejs.org/"
        exit 1
    }

    $nodeVersion = (node --version) -replace 'v', '' -split '\.' | Select-Object -First 1
    if ([int]$nodeVersion -lt 18) {
        Write-Error "Node.js version 18+ required (found v$nodeVersion)"
        exit 1
    }

    Write-Success "Node.js $(node --version) detected"
}

# Install frontend dependencies
function Install-FrontendDeps {
    Write-Step "Installing frontend dependencies..."

    Push-Location (Join-Path $ProjectDir "frontend")
    npm install
    Pop-Location

    Write-Success "Frontend dependencies installed"
}

# Setup environment file
function Initialize-EnvFile {
    $envFile = Join-Path $ProjectDir ".env"

    if (Test-Path $envFile) {
        Write-Warning ".env file already exists"

        $content = Get-Content $envFile -Raw
        if ($content -match "^DB_ENCRYPTION_KEY=.+") {
            Write-Success "Database encryption key found in .env"
            return
        } else {
            Write-Warning "No database encryption key found in .env"
        }
    }

    Write-Step "Setting up environment configuration..."

    $secretKey = & $script:PythonBin -c "import secrets; print(secrets.token_urlsafe(32))"
    $refreshSecretKey = & $script:PythonBin -c "import secrets; print(secrets.token_urlsafe(32))"
    $dbEncryptionKey = & $script:PythonBin -c "import secrets; print(secrets.token_urlsafe(64))"

    if (Test-Path $envFile) {
        Add-Content $envFile ""
        Add-Content $envFile "# Database encryption key (auto-generated)"
        Add-Content $envFile "DB_ENCRYPTION_KEY=$dbEncryptionKey"
    } else {
        @"
# CSG Flux Dashboard Configuration
# Auto-generated by setup script

# Security (auto-generated secure keys)
SECRET_KEY=$secretKey
REFRESH_SECRET_KEY=$refreshSecretKey

# Initial admin account (change password after first login!)
ADMIN_EMAIL=admin@cropdash.local
ADMIN_PASSWORD=changeme123

# Database
DATABASE_URL=sqlite:///./data/crop_dashboard.db

# Database encryption key (REQUIRED - do not lose this!)
# If lost, the database cannot be recovered.
DB_ENCRYPTION_KEY=$dbEncryptionKey

# CORS origins (adjust for your setup)
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
"@ | Set-Content $envFile
    }

    Write-Success "Environment configured with encrypted database"
    Write-Host ""
    Write-Host "IMPORTANT: Your database encryption key has been generated." -ForegroundColor Yellow
    Write-Host "           Back it up securely - if lost, data cannot be recovered!" -ForegroundColor Yellow
    Write-Host ""
}

# Build frontend
function Build-Frontend {
    Write-Step "Building frontend for production..."

    Push-Location (Join-Path $ProjectDir "frontend")
    npm run build
    Pop-Location

    Write-Success "Frontend built successfully"
}

# Start application
function Start-App($mode) {
    Write-Header "Starting CSG Flux Dashboard"

    if ($mode -eq "dev") {
        Write-Host ""
        Write-Host "Development Mode" -ForegroundColor White
        Write-Host "Backend:  http://localhost:8000 (with hot reload)"
        Write-Host "Frontend: http://localhost:5173 (with hot reload)"
        Write-Host "API Docs: http://localhost:8000/docs"
        Write-Host ""

        # Start backend in background
        $backendJob = Start-Job -ScriptBlock {
            param($python, $projectDir)
            Set-Location $projectDir
            & $python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
        } -ArgumentList $script:PythonBin, $ProjectDir

        Start-Sleep -Seconds 3

        # Start frontend (foreground)
        Push-Location (Join-Path $ProjectDir "frontend")
        try {
            npm run dev
        } finally {
            Stop-Job $backendJob -ErrorAction SilentlyContinue
            Remove-Job $backendJob -ErrorAction SilentlyContinue
            Pop-Location
        }
    } else {
        Write-Host ""
        Write-Host "Production Mode" -ForegroundColor White
        Write-Host "Application: http://localhost:8000"
        Write-Host "API Docs:    http://localhost:8000/docs"
        Write-Host ""
        Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
        Write-Host ""

        Set-Location $ProjectDir
        & $script:PythonBin -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
    }
}

# Main
function Main {
    Write-Header "CSG Flux Dashboard Setup"

    Write-Host ""
    if ($Dev) {
        Write-Host "Mode: Development (with hot reload)" -ForegroundColor White
    } else {
        Write-Host "Mode: Production" -ForegroundColor White
    }
    Write-Host ""

    Set-Location $ProjectDir

    Write-Header "Step 1: System Dependencies"
    Install-SQLCipherDeps

    Write-Header "Step 2: Python Environment"
    New-PythonEnv

    Write-Header "Step 3: Python Dependencies"
    Install-PythonDeps

    Write-Header "Step 4: Node.js Check"
    Test-NodeJs

    Write-Header "Step 5: Frontend Dependencies"
    Install-FrontendDeps

    Write-Header "Step 6: Configuration"
    Initialize-EnvFile

    if (-not $Dev) {
        Write-Header "Step 7: Build Frontend"
        Build-Frontend
    }

    if ($Dev) {
        Start-App "dev"
    } else {
        Start-App "prod"
    }
}

Main
