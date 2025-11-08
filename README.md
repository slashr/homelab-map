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

1. **Configure your home location** - Edit `agent/agent.py` (lines 32-36):
   ```python
   HOME_LOCATION = {
       'city': 'Your City',  # Just your city name
       'lat': 30.2672,       # Approximate latitude
       'lon': -97.7431,      # Approximate longitude
   }
   ```
   Find coordinates at https://www.latlong.net/

2. **Update Docker registry** - Edit image names in `k8s/*.yaml` or set env var:
   ```bash
   export REGISTRY=docker.io/yourusername
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
  - Variables: `REGISTRY` (e.g., `docker.io/dawker`), `HOMELAB_DEPLOYMENTS_REPO` (owner/repo for the manifests), optional `HOMELAB_DEPLOYMENTS_BRANCH` (default `main`), and optional `HOMELAB_DEPLOYMENTS_SERVICES` (comma-separated list, default `agent,aggregator,frontend`).
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
