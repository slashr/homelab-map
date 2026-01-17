# Setup Guide

This guide will walk you through deploying the homelab-map application to your k3s cluster.

## Prerequisites

- k3s cluster running (with your 8 nodes)
- kubectl configured to access your cluster
- Docker installed for building images
- A Docker registry to push images (Docker Hub, GitHub Container Registry, etc.)

## Quick Start

### 1. Configure Your Docker Registry

Edit the following files and replace `your-registry/` with your actual registry:

```bash
# k8s/agent-daemonset.yaml
# k8s/aggregator-deployment.yaml
# k8s/frontend-deployment.yaml
```

Or set the `REGISTRY` environment variable:

```bash
export REGISTRY=docker.io/yourusername
```

### 2. Update Your Home Location

Edit `agent/agent.py` and update the `HOME_LOCATION` section (lines 32-36):

```python
HOME_LOCATION = {
    'city': 'Your City, State',  # e.g., "Austin, TX"
    'lat': YOUR_LAT,             # e.g., 30.2672
    'lon': YOUR_LON,             # e.g., -97.7431
}
```

**Finding your coordinates:**
- Visit https://www.latlong.net/
- Enter your city name
- Copy the latitude and longitude (approximate is fine!)

**Note**: Cloud provider locations (Oracle, GCP) are pre-configured with their datacenter locations - no need to change those!

### 2b. Optional Performance Tunables

Set these in your agent/aggregator manifests to reduce connection churn on larger clusters:

- Aggregator: `MAX_CONNECTIONS` (default 500), `DEDUP_CONNECTIONS` (default true)
- Agent: `REPORT_INTERVAL` (default 30s), `CONNECTION_CHECK_INTERVAL` (default 5),
  `MAX_CONNECTION_TARGETS` (default 25)

### 3. Build and Push Docker Images

```bash
# Build all images
make build

# Or manually:
export REGISTRY=docker.io/yourusername
export VERSION=v1.0.0
./scripts/build.sh
```

### 4. Deploy to k3s

```bash
# Deploy all services
make deploy

# Or manually:
./scripts/deploy.sh
```

### 5. Access the Application

#### Option A: Port Forward (Development)
```bash
# Forward frontend to localhost:3000
make port-forward

# Or manually:
kubectl port-forward -n homelab-map svc/homelab-map-frontend 3000:80
```

Then open: http://localhost:3000

#### Option B: Ingress (Production)

1. Update `k8s/ingress.yaml` with your domain:
```yaml
- host: homelab-map.yourdomain.com
```

2. Apply the ingress:
```bash
kubectl apply -f k8s/ingress.yaml
```

3. Access via your domain: https://homelab-map.yourdomain.com

## Development

### Run Locally

```bash
make dev
```

This starts:
- Aggregator on http://localhost:8000
- Frontend on http://localhost:3000

**Note**: The agent requires a k3s cluster to run.

### Test Individual Services

#### Aggregator
```bash
cd aggregator
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

Visit: http://localhost:8000

#### Frontend
```bash
cd frontend
npm install
export REACT_APP_AGGREGATOR_URL=http://localhost:8000
npm start
```

Visit: http://localhost:3000

## Monitoring

### View Logs

```bash
# Agent logs
make logs-agent

# Aggregator logs
make logs-aggregator

# Frontend logs
make logs-frontend
```

### Check Status

```bash
make status

# Or manually:
kubectl get all -n homelab-map
```

### View Node Data

```bash
# Get all nodes from aggregator
kubectl port-forward -n homelab-map svc/homelab-map-aggregator 8000:8000

# In another terminal:
curl http://localhost:8000/api/nodes

# Get cluster stats
curl http://localhost:8000/api/stats
```

## Troubleshooting

### Agent Not Sending Data

1. Check agent logs:
```bash
kubectl logs -n homelab-map daemonset/homelab-map-agent
```

2. Verify aggregator is running:
```bash
kubectl get pods -n homelab-map -l app=homelab-map-aggregator
```

3. Check network connectivity:
```bash
kubectl exec -n homelab-map -it daemonset/homelab-map-agent -- sh
# Inside pod:
curl http://homelab-map-aggregator:8000/
```

### Frontend Not Loading

1. Check frontend logs:
```bash
kubectl logs -n homelab-map deployment/homelab-map-frontend
```

2. Verify aggregator URL in frontend config:
```bash
kubectl get pods -n homelab-map -l app=homelab-map-frontend -o yaml | grep REACT_APP_AGGREGATOR_URL
```

3. Check if running in development mode with correct env var:
```bash
export REACT_APP_AGGREGATOR_URL=http://localhost:8000
```

### Nodes Not Appearing on Map

1. Verify node locations are configured in `agent/agent.py`
2. Check that agents are reporting data:
```bash
curl http://localhost:8000/api/nodes
```
3. Look for nodes with `lat` and `lon` fields

### Permission Issues

If agent can't access k8s API:

1. Verify ServiceAccount exists:
```bash
kubectl get serviceaccount -n homelab-map homelab-map-agent
```

2. Check ClusterRole and ClusterRoleBinding:
```bash
kubectl get clusterrole homelab-map-agent
kubectl get clusterrolebinding homelab-map-agent
```

## Updating

### Update Images

```bash
# Build new version
export VERSION=v1.1.0
make build

# Update deployments
make update-images VERSION=v1.1.0
```

### Restart Services

```bash
make restart
```

## Cleanup

Remove all resources:

```bash
make clean
```

## Next Steps

- [ ] Add network speed testing between nodes
- [ ] Add latency measurements
- [ ] Visualize connections between nodes
- [ ] Add historical data tracking
- [ ] Implement alerts for offline nodes
- [ ] Add dark mode toggle
- [ ] Export cluster data as JSON/CSV

## Architecture

```
┌─────────────────┐
│  michael-pi     │◄──┐
│  (k3s master)   │   │
└─────────────────┘   │
                      │
┌─────────────────┐   │
│  jim-pi         │   │
│  (worker)       │   │
└─────────────────┘   │
                      │
┌─────────────────┐   │
│  dwight-pi      │   │   ┌──────────────────┐      ┌──────────────┐
│  (worker)       │   │   │   Aggregator     │      │   Frontend   │
└─────────────────┘   ├──►│   (API Service)  │◄────►│  (React App) │
                      │   └──────────────────┘      └──────────────┘
┌─────────────────┐   │            ▲
│  pam-amd1       │   │            │
│  (oracle)       │   │            │ HTTP POST
└─────────────────┘   │            │ /api/nodes
                      │            │
┌─────────────────┐   │   ┌────────────────┐
│  angela-amd2    │   │   │  Agent         │
│  (oracle)       │   └───┤  (DaemonSet)   │
└─────────────────┘       │  Runs on ALL   │
                          │  nodes         │
┌─────────────────┐       └────────────────┘
│  stanley-arm1   │
│  (oracle)       │
└─────────────────┘

┌─────────────────┐
│  phyllis-arm2   │
│  (oracle)       │
└─────────────────┘

┌─────────────────┐
│  toby-gcp1      │
│  (gcp)          │
└─────────────────┘
```

Each node runs an agent that:
1. Collects node metadata from Kubernetes API
2. Gathers system metrics (CPU, memory, disk)
3. Sends data to aggregator every 30 seconds

The aggregator:
1. Receives data from all agents
2. Stores in-memory (can be upgraded to Redis/DB)
3. Serves REST API for frontend

The frontend:
1. Fetches node data every 10 seconds
2. Displays nodes on interactive map
3. Shows cluster statistics and health
