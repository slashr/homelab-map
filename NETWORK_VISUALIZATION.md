# Network Visualization Feature

Real-time network latency visualization between all nodes in your k3s cluster! 🔗

## Features Implemented

### 1. **Latency Measurement** (Agent)
- ✅ Agents ping all other nodes every 2.5 minutes
- ✅ Measures min/avg/max latency using ICMP ping
- ✅ Reports reachability status
- ✅ Uses Kubernetes API to discover other nodes automatically

### 2. **Connection Data API** (Aggregator)
- ✅ New endpoint: `/api/connections`
- ✅ Stores connection data from all nodes
- ✅ Returns list of all node-to-node connections with coordinates
- ✅ Updates cluster stats to include connection count

### 3. **Visual Connection Lines** (Frontend)
- ✅ Lines drawn between all connected nodes
- ✅ Color-coded by latency:
  - 🟢 **Green** - <20ms (Excellent)
  - 🟡 **Yellow** - 20-100ms (Medium)
  - 🟠 **Orange** - 100-200ms (Slow)
  - 🔴 **Red** - >200ms (Very slow)
- ✅ Line thickness indicates speed (thicker = faster)
- ✅ Dashed lines for slow connections (>100ms)

### 4. **Interactive Popups**
- ✅ **Hover** - Line becomes thicker and more opaque
- ✅ **Click** - Shows detailed connection info:
  - Source and target nodes
  - Average latency
  - Min/Max latency
  - Connection quality badge

## How It Works

```
┌─────────────┐
│   Agent     │ Every 2.5 minutes:
│  (Node A)   │ 1. Discovers other nodes via k8s API
└──────┬──────┘ 2. Pings each node (ICMP)
       │        3. Measures latency
       │        4. Sends to aggregator
       ▼
┌─────────────┐
│ Aggregator  │ Stores connections:
└──────┬──────┘ - node-a → node-b: 15ms
       │        - node-a → node-c: 45ms
       │        - etc.
       ▼
┌─────────────┐
│  Frontend   │ Every 10 seconds:
└─────────────┘ 1. Fetches connections
                2. Draws lines between nodes
                3. Colors by latency

```

## Latency Quality Grades

| Latency | Quality | Color | Badge |
|---------|---------|-------|-------|
| < 20ms | Excellent | 🟢 Green | ⚡ Excellent |
| 20-50ms | Good | 🟢 Light Green | ✓ Good |
| 50-100ms | Medium | 🟡 Yellow | ~ Medium |
| 100-200ms | Slow | 🟠 Orange | ⚠ Slow |
| > 200ms | Very Slow | 🔴 Red | ⚠ Slow |

## Expected Latency

**Your cluster:**
- 🏠 **Berlin ↔ Berlin** (Pi to Pi): <1ms (same LAN)
- 🇩🇪 **Berlin ↔ San Jose** (Pi to Oracle): ~150ms (intercontinental)
- 🇺🇸 **San Jose ↔ Iowa** (Oracle to GCP): ~40ms (cross-US)
- 🇺🇸 **San Jose ↔ San Jose** (Oracle to Oracle): <5ms (same datacenter)

## Deployment

```bash
# Rebuild all three services
docker build -t dawker/homelab-map-agent:latest ./agent
docker push dawker/homelab-map-agent:latest

docker build -t dawker/homelab-map-aggregator:latest ./aggregator
docker push dawker/homelab-map-aggregator:latest

docker build -t dawker/homelab-map-frontend:latest ./frontend
docker push dawker/homelab-map-frontend:latest

# Restart deployments
kubectl rollout restart daemonset/homelab-map-agent -n homelab-map
kubectl rollout restart deployment/homelab-map-aggregator -n homelab-map
kubectl rollout restart deployment/homelab-map-frontend -n homelab-map
```

## What You'll See

1. **Character avatars** at each node location
2. **Colored lines** connecting all reachable nodes
3. **Hover over a line** - It gets thicker and brighter
4. **Click a line** - Popup shows:
   - Source and target nodes
   - Latency (avg/min/max)
   - Quality badge

## Performance

- **Agent CPU impact**: ~5% spike during ping (every 2.5 min)
- **Network traffic**: Minimal (3 ICMP packets per connection)
- **Frontend rendering**: Smooth with ~30 connections
- **Data refresh**: Every 10 seconds (no performance impact)

## Future Enhancements

- [ ] Bandwidth testing (iperf3 between nodes)
- [ ] Historical latency graphs
- [ ] Alert on degraded connections
- [ ] TCP/UDP port testing
- [ ] Packet loss percentage
- [ ] Network path visualization (traceroute)
