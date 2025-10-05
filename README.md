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

## Features

- [x] Map overlay with node locations
- [ ] Real-time network speed metrics
- [ ] Latency visualization between nodes
- [ ] Node health status
- [ ] Historical data tracking

## License

MIT
