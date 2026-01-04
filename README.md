# Homelab K3s Cluster Map

A real-time visualization tool for monitoring your k3s homelab cluster across multiple cloud providers and on-premises infrastructure.

## Architecture

### Components

1. **Agent (DaemonSet)** - Runs on every k3s node
   - Collects node metadata (hostname, region, IP, cloud provider)
   - Gathers network metrics (latency, bandwidth)
   - Sends data to aggregator service

2. **Aggregator (API Service)** - Central data collection point
   - Receives data from all agents
   - Consolidates and stores node information
   - Provides REST API for frontend

3. **Frontend (React)** - Web-based visualization
   - Interactive map overlay showing node locations
   - Real-time network metrics display
   - Connection visualization between nodes

## Infrastructure

### Nodes

**Raspberry Pis (On-Premises):**
- michael-pi (192.168.1.100) - k3s master
- jim-pi (192.168.1.101) - worker

**Oracle Cloud:**
- angela-amd2 (130.61.63.188) - worker
- stanley-arm1 (130.162.225.255) - worker
- phyllis-arm2 (138.2.130.168) - worker

**Google Cloud:**
- toby-gcp1 (34.28.187.2) - worker

## Quick Start

### Prerequisites
- k3s cluster running
- kubectl configured
- Docker for building images
- Docker registry (Docker Hub, GHCR, etc.)

### Setup

1. **Configure your home location** - Set environment variables before starting the agent (or add them to your DaemonSet manifest):
   ```bash
   export HOME_CITY="Austin, TX"
   export HOME_LAT=30.2672
   export HOME_LON=-97.7431
   ```
   The agent falls back to Berlin, Germany when these variables are omitted. Find coordinates at https://www.latlong.net/.

2. **Update Docker registry** - Edit image names in `k8s/*.yaml` or set env var:
   ```bash
   export REGISTRY=docker.io/yourusername
   ```

### Configuration

**Aggregator Environment Variables:**
- `NODE_TIMEOUT_SECONDS`: Number of seconds before a node is marked offline. Defaults to 120.
- `CLEANUP_GRACE_PERIOD_SECONDS`: Number of seconds after timeout before stale nodes are removed. Defaults to 86400 (24 hours).

  ```bash
  export NODE_TIMEOUT_SECONDS=300
  export CLEANUP_GRACE_PERIOD_SECONDS=86400
  cd aggregator
  uvicorn main:app --reload
  ```

**Agent Environment Variables:**
- `HOME_CITY`, `HOME_LAT`, `HOME_LON`: Override the default Berlin home marker for your on-prem nodes.
- `ENABLE_AUTO_GEOLOCATION`: Enable automatic geolocation detection (default: true). Set to 'false' to disable.

  ```bash
  export HOME_CITY="Austin, TX"
  export HOME_LAT=30.2672
  export HOME_LON=-97.7431
  export ENABLE_AUTO_GEOLOCATION=true
  ```

**Automatic Geolocation:**
The agent automatically detects node locations using:
1. Manual override (NODE_LOCATIONS dict in agent.py) - highest priority
2. Cloud provider metadata (Oracle Cloud, GCP, AWS)
3. IP geolocation API (ip-api.com) - fallback for other nodes

Nodes not in the manual mapping will be automatically geolocated on first run. Results are cached to avoid repeated API calls.

### Deployment

```bash
# Build and push images
make build

# Deploy to k3s
make deploy

# Access frontend
make port-forward
```

Visit http://localhost:3000 to view your cluster map.

See [SETUP.md](SETUP.md) for detailed instructions.

## Development

### Local Development

The easiest way to develop and test locally is using the provided development script:

```bash
# Run all services with docker-compose
./scripts/dev.sh docker

# Or run services individually for hot reload
./scripts/dev.sh aggregator  # Terminal 1
./scripts/dev.sh frontend    # Terminal 2 (requires aggregator running)
```

#### Using Docker Compose

Start the full stack (aggregator + frontend) with docker-compose:

```bash
docker-compose up --build
```

- Frontend: http://localhost:3000
- Aggregator API: http://localhost:8000
- API Docs: http://localhost:8000/docs

#### Individual Service Development

For hot reload during development, run services individually:

**Aggregator:**
```bash
cd aggregator
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
REACT_APP_AGGREGATOR_URL=http://localhost:8000 npm start
```

**Agent:**
```bash
cd agent
pip install -r requirements.txt
# Note: Agent requires Kubernetes API access, so this only works in-cluster
# For local testing, use mock data in frontend instead
python agent.py
```

#### Testing with Mock Data

The frontend supports mock data for development without a running aggregator:

```bash
cd frontend
REACT_APP_USE_MOCK_DATA=true npm start
```

Or with docker-compose:
```bash
REACT_APP_USE_MOCK_DATA=true docker-compose up frontend
```

#### Manual API Testing

You can manually add test nodes via the aggregator API:

```bash
# Add a test node
curl -X POST http://localhost:8000/api/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-node",
    "hostname": "test.example.com",
    "internal_ip": "10.0.0.1",
    "external_ip": "1.2.3.4",
    "lat": 37.7749,
    "lon": -122.4194,
    "location": "San Francisco, CA",
    "status": "online",
    "cpu_percent": 25.5,
    "memory_percent": 60.0
  }'

# View all nodes
curl http://localhost:8000/api/nodes

# View stats
curl http://localhost:8000/api/stats
```

## Automated Releases

- Every merge into `main` triggers the `Release` workflow (direct pushes are ignored because the workflow requires an associated pull request). Label the PR with `feat`, `fix`, or `major release` (aliases: `feature`, `enhancement`, `bug`, `breaking`, etc.) to control the SemVer bump. Without a label the workflow defaults to a patch bump.
- The workflow tags the merge commit (e.g., `v1.2.3`), uses lightweight path filters to figure out which service directories changed, and invokes the reusable `Build and Publish Container Images` pipeline with only those services (manual dispatches can still force a full rebuild). Container builds use the GitHub Actions cache with BuildKit’s `cache-from/cache-to` flags so identical layers transfer in seconds instead of minutes.
- Configure the following repository settings so the automation can run:
  - Secrets: `REGISTRY_USERNAME`, `REGISTRY_PASSWORD`, and `HOMELAB_DEPLOYMENTS_TOKEN` (PAT with `public_repo` access) for pushing Docker images and updating the deployments repo.
  - Variables: `REGISTRY` (e.g., `docker.io/dawker`), `HOMELAB_DEPLOYMENTS_REPO` (defaults to `slashr/homelab-deployments`, override if your manifests live elsewhere), optional `HOMELAB_DEPLOYMENTS_BRANCH` (default `main`), and optional `HOMELAB_DEPLOYMENTS_SERVICES` (comma-separated list, default `agent,aggregator,frontend`).
- Documentation-only or infra-only merges automatically skip releases because no services are flagged as changed. To skip a release for other reasons (e.g., CI-only), add the `skip release` label before merging. The workflow also respects aliases via the optional `SKIP_RELEASE_LABELS` variable.
- After the images push, the workflow clones the configured `homelab-deployments` repo, uses `scripts/update_homelab_deployments.py` to bump the image references for the same filtered service subset, and opens an automated PR so only those deployments roll forward.
- You can also run the `Release` workflow manually from the Actions tab, choosing the bump size from the dropdown if you need an out-of-band release.

## Features

- [x] Map overlay with node locations
- [x] Real-time network speed metrics (per-node transmit/receive bytes per second computed by the agent)
- [ ] Latency visualization between nodes
- [ ] Node health status
- [ ] Historical data tracking

Agents expose `network_tx_bytes_per_sec` and `network_rx_bytes_per_sec` in every payload, allowing the aggregator API and UI to display live upload/download speeds per node as well as cluster-wide averages.

## License

MIT
