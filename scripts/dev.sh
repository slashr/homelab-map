#!/bin/bash
# Development script for homelab-map
# Runs services locally for development and testing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "🏠 Homelab Map - Development Mode"
echo ""

# Resolve bun binary (prefer PATH, fall back to default install location).
resolve_bun() {
    if command -v bun &>/dev/null; then
        echo "bun"
        return 0
    fi

    if [ -x "$HOME/.bun/bin/bun" ]; then
        echo "$HOME/.bun/bin/bun"
        return 0
    fi

    echo "❌ Error: Bun is required for frontend development but was not found." >&2
    echo "   Install: https://bun.sh (default installer puts it in ~/.bun/bin)" >&2
    return 1
}

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is required for development"
    exit 1
fi

# Function to run aggregator locally
run_aggregator() {
    echo "🚀 Starting aggregator in development mode..."
    cd "$PROJECT_ROOT/aggregator"
    if [ ! -d "venv" ]; then
        echo "📦 Creating virtual environment..."
        python3 -m venv venv
    fi
    source venv/bin/activate
    pip install -q -r requirements.txt
    echo "✅ Aggregator running at http://localhost:8000"
    echo "   API docs: http://localhost:8000/docs"
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
}

# Function to run frontend locally
run_frontend() {
    echo "🚀 Starting frontend in development mode..."
    cd "$PROJECT_ROOT/frontend"
    BUN_BIN="$(resolve_bun)" || exit 1
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing dependencies..."
        "$BUN_BIN" install --frozen-lockfile
    fi
    echo "✅ Frontend running at http://localhost:3000"
    REACT_APP_AGGREGATOR_URL=http://localhost:8000 "$BUN_BIN" run start
}

# Function to run with docker-compose
run_docker_compose() {
    echo "🐳 Starting services with docker-compose..."
    echo "   Frontend: http://localhost:3000"
    echo "   Aggregator: http://localhost:8000"
    echo ""
    echo "💡 Tip: Use mock data by setting REACT_APP_USE_MOCK_DATA=true"
    echo ""
    docker-compose up --build
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [service]"
    echo ""
    echo "Services:"
    echo "  aggregator  - Run aggregator locally with hot reload"
    echo "  frontend    - Run frontend locally with hot reload"
    echo "  docker      - Run all services with docker-compose"
    echo "  all         - Run aggregator and frontend in separate terminals"
    echo ""
    echo "Examples:"
    echo "  $0 aggregator    # Start aggregator only"
    echo "  $0 frontend      # Start frontend only (requires aggregator running)"
    echo "  $0 docker        # Start all services with docker-compose"
    echo ""
    echo "Environment variables:"
    echo "  REACT_APP_USE_MOCK_DATA=true  - Use mock data in frontend"
    echo "  REACT_APP_AGGREGATOR_URL      - Override aggregator URL (default: http://localhost:8000)"
}

# Parse arguments
case "${1:-}" in
    aggregator)
        run_aggregator
        ;;
    frontend)
        run_frontend
        ;;
    docker|docker-compose)
        run_docker_compose
        ;;
    all)
        echo "🚀 Starting all services..."
        echo "   Opening aggregator in background..."
        run_aggregator &
        AGGREGATOR_PID=$!
        sleep 3
        echo "   Opening frontend..."
        run_frontend
        kill $AGGREGATOR_PID 2>/dev/null || true
        ;;
    help|--help|-h)
        show_usage
        ;;
    "")
        echo "❓ No service specified. Use 'help' for usage information."
        echo ""
        show_usage
        exit 1
        ;;
    *)
        echo "❌ Unknown service: $1"
        echo ""
        show_usage
        exit 1
        ;;
esac
