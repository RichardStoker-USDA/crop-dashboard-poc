#!/usr/bin/env bash
#
# CSG Flux Dashboard - Setup Script
# Creates environment, installs dependencies, and starts the app
#
# Usage: ./scripts/setup.sh [--dev]
#   --dev    Development mode with hot reload (for contributors)
#
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Configuration
APP_NAME="cropdash"
ENV_NAME="${APP_NAME}_env"
PYTHON_VERSION="3.11"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Parse arguments
DEV_MODE=false
for arg in "$@"; do
    case $arg in
        --dev)
            DEV_MODE=true
            shift
            ;;
    esac
done

# Helper functions
print_header() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
}

print_step() {
    echo -e "${BLUE}▶${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

check_command() {
    command -v "$1" >/dev/null 2>&1
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Darwin*)    OS="macos" ;;
        Linux*)     OS="linux" ;;
        MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
        *)          OS="unknown" ;;
    esac
    echo "$OS"
}

# Detect package manager for system dependencies
detect_system_pkg_manager() {
    if check_command brew; then
        echo "brew"
    elif check_command apt-get; then
        echo "apt"
    elif check_command dnf; then
        echo "dnf"
    elif check_command yum; then
        echo "yum"
    elif check_command pacman; then
        echo "pacman"
    else
        echo "unknown"
    fi
}

# Detect Python environment manager
detect_python_env_manager() {
    if check_command mamba; then
        echo "mamba"
    elif check_command conda; then
        echo "conda"
    elif check_command python3; then
        echo "venv"
    elif check_command python; then
        echo "venv"
    else
        echo "none"
    fi
}

# Install system dependencies for SQLCipher
install_sqlcipher_deps() {
    local pkg_manager=$(detect_system_pkg_manager)
    local os=$(detect_os)

    print_step "Installing SQLCipher system dependencies..."

    case "$pkg_manager" in
        brew)
            if ! brew list sqlcipher >/dev/null 2>&1; then
                brew install sqlcipher
            else
                print_success "SQLCipher already installed via Homebrew"
            fi
            ;;
        apt)
            print_step "Installing libsqlcipher-dev (requires sudo)..."
            sudo apt-get update
            sudo apt-get install -y libsqlcipher-dev
            ;;
        dnf|yum)
            print_step "Installing sqlcipher-devel (requires sudo)..."
            sudo $pkg_manager install -y sqlcipher-devel
            ;;
        pacman)
            print_step "Installing sqlcipher (requires sudo)..."
            sudo pacman -S --noconfirm sqlcipher
            ;;
        *)
            print_error "Could not detect package manager for SQLCipher installation"
            echo ""
            echo "Please install SQLCipher manually:"
            echo "  macOS:  brew install sqlcipher"
            echo "  Ubuntu: sudo apt-get install libsqlcipher-dev"
            echo "  Fedora: sudo dnf install sqlcipher-devel"
            echo "  Arch:   sudo pacman -S sqlcipher"
            echo ""
            exit 1
            ;;
    esac
}

# Create Python environment
create_python_env() {
    local env_manager=$(detect_python_env_manager)
    local env_path="$PROJECT_DIR/.venv"

    print_step "Creating Python environment using $env_manager..."

    case "$env_manager" in
        mamba|conda)
            # Check if environment exists
            if $env_manager env list | grep -q "^$ENV_NAME "; then
                print_warning "Environment '$ENV_NAME' already exists"
                read -p "Recreate it? (y/N): " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    $env_manager env remove -n "$ENV_NAME" -y
                    $env_manager create -n "$ENV_NAME" python=$PYTHON_VERSION -y
                fi
            else
                $env_manager create -n "$ENV_NAME" python=$PYTHON_VERSION -y
            fi

            # Get env path for later use
            ENV_PATH=$($env_manager env list | grep "^$ENV_NAME " | awk '{print $2}')
            PYTHON_BIN="$ENV_PATH/bin/python"
            PIP_BIN="$ENV_PATH/bin/pip"
            ;;
        venv)
            if [ -d "$env_path" ]; then
                print_warning "Virtual environment already exists at $env_path"
                read -p "Recreate it? (y/N): " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    rm -rf "$env_path"
                    python3 -m venv "$env_path"
                fi
            else
                python3 -m venv "$env_path"
            fi

            ENV_PATH="$env_path"
            PYTHON_BIN="$env_path/bin/python"
            PIP_BIN="$env_path/bin/pip"
            ;;
        none)
            print_error "No Python environment manager found!"
            echo ""
            echo "Please install one of the following:"
            echo "  - Miniforge/Mambaforge (recommended): https://github.com/conda-forge/miniforge"
            echo "  - Miniconda: https://docs.conda.io/en/latest/miniconda.html"
            echo "  - Python 3.11+: https://www.python.org/downloads/"
            echo ""
            exit 1
            ;;
    esac

    print_success "Python environment ready: $ENV_PATH"
}

# Install Python dependencies
install_python_deps() {
    print_step "Installing Python dependencies..."

    # Upgrade pip first
    "$PIP_BIN" install --upgrade pip

    # Install requirements
    "$PIP_BIN" install -r "$PROJECT_DIR/backend/requirements.txt"

    # Verify SQLCipher installation
    if "$PYTHON_BIN" -c "import sqlcipher3" 2>/dev/null; then
        print_success "SQLCipher Python bindings installed successfully"
    else
        print_error "Failed to install sqlcipher3 Python package"
        echo ""
        echo "This usually means SQLCipher system libraries are not installed."
        echo "Please install them and run this script again."
        exit 1
    fi
}

# Check for Node.js and npm
check_node() {
    if ! check_command node; then
        print_error "Node.js is not installed"
        echo ""
        echo "Please install Node.js 18+ from: https://nodejs.org/"
        echo "Or use a version manager like nvm: https://github.com/nvm-sh/nvm"
        exit 1
    fi

    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        print_error "Node.js version 18+ required (found v$node_version)"
        exit 1
    fi

    print_success "Node.js $(node --version) detected"
}

# Install frontend dependencies
install_frontend_deps() {
    print_step "Installing frontend dependencies..."

    cd "$PROJECT_DIR/frontend"
    npm install
    cd "$PROJECT_DIR"

    print_success "Frontend dependencies installed"
}

# Setup environment file
setup_env_file() {
    local env_file="$PROJECT_DIR/.env"

    if [ -f "$env_file" ]; then
        print_warning ".env file already exists"

        # Check if it has encryption key
        if grep -q "^DB_ENCRYPTION_KEY=.\+" "$env_file"; then
            print_success "Database encryption key found in .env"
            return
        else
            print_warning "No database encryption key found in .env"
        fi
    fi

    print_step "Setting up environment configuration..."

    # Generate secure keys
    SECRET_KEY=$("$PYTHON_BIN" -c "import secrets; print(secrets.token_urlsafe(32))")
    REFRESH_SECRET_KEY=$("$PYTHON_BIN" -c "import secrets; print(secrets.token_urlsafe(32))")
    DB_ENCRYPTION_KEY=$("$PYTHON_BIN" -c "import secrets; print(secrets.token_urlsafe(64))")

    if [ -f "$env_file" ]; then
        # Append encryption key if missing
        echo "" >> "$env_file"
        echo "# Database encryption key (auto-generated)" >> "$env_file"
        echo "DB_ENCRYPTION_KEY=$DB_ENCRYPTION_KEY" >> "$env_file"
    else
        # Create new .env file
        cat > "$env_file" << EOF
# CSG Flux Dashboard Configuration
# Auto-generated by setup script

# Security (auto-generated secure keys)
SECRET_KEY=$SECRET_KEY
REFRESH_SECRET_KEY=$REFRESH_SECRET_KEY

# Initial admin account (change password after first login!)
ADMIN_EMAIL=admin@cropdash.local
ADMIN_PASSWORD=changeme123

# Database
DATABASE_URL=sqlite:///./data/crop_dashboard.db

# Database encryption key (REQUIRED - do not lose this!)
# If lost, the database cannot be recovered.
DB_ENCRYPTION_KEY=$DB_ENCRYPTION_KEY

# CORS origins (adjust for your setup)
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
EOF
    fi

    print_success "Environment configured with encrypted database"
    echo ""
    echo -e "${YELLOW}IMPORTANT:${NC} Your database encryption key has been generated."
    echo -e "           Back it up securely - if lost, data cannot be recovered!"
    echo ""
}

# Build frontend for production
build_frontend() {
    print_step "Building frontend for production..."

    cd "$PROJECT_DIR/frontend"
    npm run build
    cd "$PROJECT_DIR"

    print_success "Frontend built successfully"
}

# Start the application
start_app() {
    local mode=$1

    print_header "Starting CSG Flux Dashboard"

    if [ "$mode" = "dev" ]; then
        echo ""
        echo -e "${BOLD}Development Mode${NC}"
        echo "Backend:  http://localhost:8000 (with hot reload)"
        echo "Frontend: http://localhost:5173 (with hot reload)"
        echo "API Docs: http://localhost:8000/docs"
        echo ""
        echo -e "${YELLOW}Starting backend in background...${NC}"

        cd "$PROJECT_DIR"
        "$PYTHON_BIN" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
        BACKEND_PID=$!

        sleep 3

        echo -e "${YELLOW}Starting frontend...${NC}"
        echo ""

        cd "$PROJECT_DIR/frontend"
        npm run dev

        # Cleanup on exit
        kill $BACKEND_PID 2>/dev/null
    else
        echo ""
        echo -e "${BOLD}Production Mode${NC}"
        echo "Application: http://localhost:8000"
        echo "API Docs:    http://localhost:8000/docs"
        echo ""
        echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
        echo ""

        cd "$PROJECT_DIR"
        "$PYTHON_BIN" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
    fi
}

# Main setup flow
main() {
    print_header "CSG Flux Dashboard Setup"

    echo ""
    if [ "$DEV_MODE" = true ]; then
        echo -e "${BOLD}Mode:${NC} Development (with hot reload)"
    else
        echo -e "${BOLD}Mode:${NC} Production"
    fi
    echo ""

    # Change to project directory
    cd "$PROJECT_DIR"

    # Step 1: Install SQLCipher system dependencies
    print_header "Step 1: System Dependencies"
    install_sqlcipher_deps

    # Step 2: Create Python environment
    print_header "Step 2: Python Environment"
    create_python_env

    # Step 3: Install Python dependencies
    print_header "Step 3: Python Dependencies"
    install_python_deps

    # Step 4: Check Node.js
    print_header "Step 4: Node.js Check"
    check_node

    # Step 5: Install frontend dependencies
    print_header "Step 5: Frontend Dependencies"
    install_frontend_deps

    # Step 6: Setup environment file
    print_header "Step 6: Configuration"
    setup_env_file

    # Step 7: Build frontend (production only)
    if [ "$DEV_MODE" = false ]; then
        print_header "Step 7: Build Frontend"
        build_frontend
    fi

    # Step 8: Start the app
    if [ "$DEV_MODE" = true ]; then
        start_app "dev"
    else
        start_app "prod"
    fi
}

# Run main
main
