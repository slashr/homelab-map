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

- `NODE_TIMEOUT_SECONDS` (aggregator): Number of seconds before a node is marked offline. Defaults to 120. Override it before starting the API service if your agents report infrequently:

  ```bash
  export NODE_TIMEOUT_SECONDS=300
  cd aggregator
  uvicorn main:app --reload
  ```

- `HOME_CITY`, `HOME_LAT`, `HOME_LON` (agent): Override the default Berlin home marker for your on-prem nodes. Set these before building or deploying the agent container:

  ```bash
  export HOME_CITY="Austin, TX"
  export HOME_LAT=30.2672
  export HOME_LON=-97.7431
  ```

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

### Agent
```bash
cd agent
pip install -r requirements.txt
python agent.py
```

### Aggregator
```bash
cd aggregator
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## Automated Releases

- Every merge into `main` triggers the `Release` workflow (direct pushes are ignored because the workflow requires an associated pull request). Label the PR with `feat`, `fix`, or `major release` (aliases: `feature`, `enhancement`, `bug`, `breaking`, etc.) to control the SemVer bump. Without a label the workflow defaults to a patch bump.
- The workflow tags the merge commit (e.g., `v1.2.3`), invokes the reusable `Build and Publish Container Images` pipeline to build/push all service images with that tag, and still publishes a commit-hash fallback tag.
- Configure the following repository settings so the automation can run:
  - Secrets: `REGISTRY_USERNAME`, `REGISTRY_PASSWORD`, and `HOMELAB_DEPLOYMENTS_TOKEN` (PAT with `public_repo` access) for pushing Docker images and updating the deployments repo.
  - Variables: `REGISTRY` (e.g., `docker.io/dawker`), `HOMELAB_DEPLOYMENTS_REPO` (defaults to `slashr/homelab-deployments`, override if your manifests live elsewhere), optional `HOMELAB_DEPLOYMENTS_BRANCH` (default `main`), and optional `HOMELAB_DEPLOYMENTS_SERVICES` (comma-separated list, default `agent,aggregator,frontend`).
- To skip a release (e.g., CI-only or docs-only changes), add the `skip release` label before merging. The workflow also respects additional aliases via the optional `SKIP_RELEASE_LABELS` variable.
- After the images push, the workflow clones the configured `homelab-deployments` repo, uses `scripts/update_homelab_deployments.py` to bump every `homelab-map-*` image reference to the new tag, and opens an automated PR so the deployment picks up the fresh images.
- You can also run the `Release` workflow manually from the Actions tab, choosing the bump size from the dropdown if you need an out-of-band release.

## Features

- [x] Map overlay with node locations
- [ ] Real-time network speed metrics
- [ ] Latency visualization between nodes
- [ ] Node health status
- [ ] Historical data tracking

## License

MIT
