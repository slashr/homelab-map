#!/usr/bin/env python3
"""
Homelab K3s Aggregator - Central API service
Receives data from agents and serves to frontend
"""

import os
import time
import logging
import hashlib
from typing import Dict, List, Optional
from datetime import datetime
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException
from openai import AsyncOpenAI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize async OpenAI client (uses OPENAI_API_KEY env var)
openai_client: Optional[AsyncOpenAI] = None
if os.getenv("OPENAI_API_KEY"):
    openai_client = AsyncOpenAI()
    logger.info("AsyncOpenAI client initialized")
else:
    logger.warning("OPENAI_API_KEY not set, quote generation will use fallback quotes")

# Interactive mode password (required for AI quote generation)
INTERACTIVE_PASSWORD = os.getenv("INTERACTIVE_PASSWORD")
if not INTERACTIVE_PASSWORD:
    logger.warning("INTERACTIVE_PASSWORD not set, interactive quote mode will be disabled")


@dataclass
class QuoteCache:
    """Cached quote with metadata"""
    quote: str
    generated_at: float  # Unix timestamp
    metrics_hash: str  # Hash of metrics used to generate quote


# In-memory quote cache (node_name -> QuoteCache)
quote_cache: Dict[str, QuoteCache] = {}
QUOTE_CACHE_TTL_SECONDS = 86400  # 24 hours

# Static fallback quotes for when OpenAI is unavailable
FALLBACK_QUOTES = {
    'michael': "I'm not superstitious, but I am a little stitious.",
    'dwight': "Identity theft is not a joke, Jim! Millions of families suffer every year!",
    'jim': "Bears. Beets. Battlestar Galactica.",
    'pam': "There's a lot of beauty in ordinary things. Isn't that kind of the point?",
    'angela': "I don't have a headache. I'm just preparing.",
    'kevin': "Why waste time say lot word when few word do trick?",
    'stanley': "Did I stutter?",
    'phyllis': "Close your mouth, sweetie. You look like a trout.",
    'toby': "I hate so much about the things that you choose to be.",
    'oscar': "Actually...",
    'creed': "Nobody steals from Creed Bratton and gets away with it.",
    'meredith': "It's casual day!",
    'andy': "I'm always thinking one step ahead... like a carpenter that makes stairs.",
    'ryan': "I'd rather she be alone than with somebody. Is that love?",
    'kelly': "I talk a lot, so I've learned to tune myself out.",
}

# Initialize FastAPI app
app = FastAPI(
    title="Homelab K3s Aggregator",
    description="Central API for collecting and serving k3s cluster data",
    version="0.1.0"
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for node data and connections
nodes_data: Dict[str, dict] = {}
connections_data: Dict[str, list] = {}  # Key: source_node, Value: list of connections
NODE_TIMEOUT_ENV_VAR = "NODE_TIMEOUT_SECONDS"
DEFAULT_NODE_TIMEOUT_SECONDS = 120
CLEANUP_GRACE_PERIOD_ENV_VAR = "CLEANUP_GRACE_PERIOD_SECONDS"
DEFAULT_CLEANUP_GRACE_PERIOD_SECONDS = 86400  # 24 hours
MAX_CONNECTIONS_ENV_VAR = "MAX_CONNECTIONS"
DEFAULT_MAX_CONNECTIONS = 500
DEDUP_CONNECTIONS_ENV_VAR = "DEDUP_CONNECTIONS"
DEFAULT_DEDUP_CONNECTIONS = True


def _load_node_timeout() -> int:
    """Resolve the node timeout from the environment with a safe fallback."""
    raw_value = os.getenv(NODE_TIMEOUT_ENV_VAR)
    if raw_value is None:
        return DEFAULT_NODE_TIMEOUT_SECONDS

    try:
        value = int(raw_value)
    except ValueError:
        logger.warning(
            "NODE_TIMEOUT_SECONDS=%s is not a valid integer; falling back to %ss",
            raw_value,
            DEFAULT_NODE_TIMEOUT_SECONDS,
        )
        return DEFAULT_NODE_TIMEOUT_SECONDS

    if value <= 0:
        logger.warning(
            "NODE_TIMEOUT_SECONDS must be positive; falling back to %ss",
            DEFAULT_NODE_TIMEOUT_SECONDS,
        )
        return DEFAULT_NODE_TIMEOUT_SECONDS

    return value


NODE_TIMEOUT = _load_node_timeout()


def _load_cleanup_grace_period() -> int:
    """Resolve the cleanup grace period from the environment with a safe fallback."""
    raw_value = os.getenv(CLEANUP_GRACE_PERIOD_ENV_VAR)
    if raw_value is None:
        return DEFAULT_CLEANUP_GRACE_PERIOD_SECONDS

    try:
        value = int(raw_value)
    except ValueError:
        logger.warning(
            "CLEANUP_GRACE_PERIOD_SECONDS=%s is not a valid integer; falling back to %ss",
            raw_value,
            DEFAULT_CLEANUP_GRACE_PERIOD_SECONDS,
        )
        return DEFAULT_CLEANUP_GRACE_PERIOD_SECONDS

    if value <= 0:
        logger.warning(
            "CLEANUP_GRACE_PERIOD_SECONDS must be positive; falling back to %ss",
            DEFAULT_CLEANUP_GRACE_PERIOD_SECONDS,
        )
        return DEFAULT_CLEANUP_GRACE_PERIOD_SECONDS

    return value


CLEANUP_GRACE_PERIOD = _load_cleanup_grace_period()


def _load_max_connections() -> int:
    """Resolve the max number of connections to return with a safe fallback."""
    raw_value = os.getenv(MAX_CONNECTIONS_ENV_VAR)
    if raw_value is None:
        return DEFAULT_MAX_CONNECTIONS

    try:
        value = int(raw_value)
    except ValueError:
        logger.warning(
            "MAX_CONNECTIONS=%s is not a valid integer; falling back to %s",
            raw_value,
            DEFAULT_MAX_CONNECTIONS,
        )
        return DEFAULT_MAX_CONNECTIONS

    if value <= 0:
        logger.warning(
            "MAX_CONNECTIONS must be positive; falling back to %s",
            DEFAULT_MAX_CONNECTIONS,
        )
        return DEFAULT_MAX_CONNECTIONS

    return value


def _load_bool_env(var_name: str, default: bool) -> bool:
    raw_value = os.getenv(var_name)
    if raw_value is None:
        return default

    normalized = raw_value.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False

    logger.warning(
        "%s=%s is not a valid boolean; falling back to %s",
        var_name,
        raw_value,
        default,
    )
    return default


MAX_CONNECTIONS = _load_max_connections()
DEDUP_CONNECTIONS = _load_bool_env(DEDUP_CONNECTIONS_ENV_VAR, DEFAULT_DEDUP_CONNECTIONS)


def _cleanup_stale_nodes():
    """Remove nodes that haven't been seen in grace period"""
    current_time = time.time()
    cutoff_time = current_time - (NODE_TIMEOUT + CLEANUP_GRACE_PERIOD)
    
    nodes_to_remove = []
    for node_name, node_data in nodes_data.items():
        last_seen = node_data.get('received_at', node_data.get('timestamp', 0))
        if last_seen < cutoff_time:
            nodes_to_remove.append(node_name)
    
    for node_name in nodes_to_remove:
        del nodes_data[node_name]
        connections_data.pop(node_name, None)
        quote_cache.pop(node_name, None)  # Prune cached quotes for removed nodes
        # Also remove connections where this node is the target
        for source_node in list(connections_data.keys()):
            connections = connections_data[source_node]
            filtered_connections = []
            for conn in connections:
                # Convert Connection object to dict if needed
                if hasattr(conn, 'model_dump'):
                    conn_dict = conn.model_dump()
                elif isinstance(conn, dict):
                    conn_dict = conn
                else:
                    conn_dict = dict(conn)
                
                # Keep connection if target is not the node being removed
                if conn_dict.get('target_node') != node_name:
                    filtered_connections.append(conn)
            
            if filtered_connections:
                connections_data[source_node] = filtered_connections
            else:
                # Remove source node entry if no connections remain
                connections_data.pop(source_node, None)
        logger.info(f"Cleaned up stale node: {node_name}")
    
    if nodes_to_remove:
        logger.info(f"Cleaned up {len(nodes_to_remove)} stale node(s)")


class Connection(BaseModel):
    """Network connection data between nodes"""
    target_node: str
    target_ip: str
    latency_ms: float
    min_ms: Optional[float] = None
    max_ms: Optional[float] = None


class NodeData(BaseModel):
    """Node data model from agents"""
    name: str
    hostname: str
    internal_ip: Optional[str] = None
    external_ip: Optional[str] = None
    os_image: Optional[str] = None
    kernel_version: Optional[str] = None
    architecture: Optional[str] = None
    kubelet_version: Optional[str] = None
    container_runtime: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    location: Optional[str] = None
    provider: Optional[str] = None
    location_source: Optional[str] = None
    cpu_percent: Optional[float] = None
    memory_percent: Optional[float] = None
    disk_percent: Optional[float] = None
    network_interfaces: Optional[List[str]] = None
    network_tx_bytes_per_sec: Optional[float] = None
    network_rx_bytes_per_sec: Optional[float] = None
    connections: Optional[List[Connection]] = None
    timestamp: float = Field(default_factory=time.time)
    # Extended metrics
    cpu_temp_celsius: Optional[float] = None
    temp_critical: Optional[float] = None
    fan_rpm: Optional[int] = None
    cpu_freq_mhz: Optional[float] = None
    cpu_freq_max_mhz: Optional[float] = None
    uptime_seconds: Optional[float] = None
    load_avg_1m: Optional[float] = None
    load_avg_5m: Optional[float] = None
    load_avg_15m: Optional[float] = None
    swap_percent: Optional[float] = None
    swap_total_bytes: Optional[int] = None
    swap_used_bytes: Optional[int] = None
    memory_total_bytes: Optional[int] = None
    memory_available_bytes: Optional[int] = None
    disk_read_bytes_per_sec: Optional[float] = None
    disk_write_bytes_per_sec: Optional[float] = None
    network_packets_sent: Optional[int] = None
    network_packets_recv: Optional[int] = None
    network_errin: Optional[int] = None
    network_errout: Optional[int] = None
    network_dropin: Optional[int] = None
    network_dropout: Optional[int] = None
    process_count: Optional[int] = None


class QuoteRequest(BaseModel):
    """Request body for interactive quote generation"""
    password: str
    force_new: bool = False  # If true, bypass cache and generate a fresh quote


class NodeStatus(BaseModel):
    """Node status for frontend"""
    name: str
    hostname: str
    internal_ip: Optional[str] = None
    external_ip: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    location: Optional[str] = None
    provider: Optional[str] = None
    status: str  # online, offline, warning
    cpu_percent: Optional[float] = None
    memory_percent: Optional[float] = None
    disk_percent: Optional[float] = None
    network_tx_bytes_per_sec: Optional[float] = None
    network_rx_bytes_per_sec: Optional[float] = None
    last_seen_timestamp: float
    last_seen: str
    kubelet_version: Optional[str] = None
    # Extended metrics
    cpu_temp_celsius: Optional[float] = None
    temp_critical: Optional[float] = None
    fan_rpm: Optional[int] = None
    cpu_freq_mhz: Optional[float] = None
    cpu_freq_max_mhz: Optional[float] = None
    uptime_seconds: Optional[float] = None
    load_avg_1m: Optional[float] = None
    load_avg_5m: Optional[float] = None
    load_avg_15m: Optional[float] = None
    swap_percent: Optional[float] = None
    memory_total_bytes: Optional[int] = None
    memory_available_bytes: Optional[int] = None
    disk_read_bytes_per_sec: Optional[float] = None
    disk_write_bytes_per_sec: Optional[float] = None
    network_errin: Optional[int] = None
    network_errout: Optional[int] = None
    network_dropin: Optional[int] = None
    network_dropout: Optional[int] = None
    process_count: Optional[int] = None


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "homelab-k3s-aggregator",
        "status": "running",
        "nodes_count": len(nodes_data),
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/api/nodes")
async def receive_node_data(node: NodeData):
    """Receive and store node data from agents"""
    try:
        node_dict = node.model_dump()
        node_dict['received_at'] = time.time()
        
        # Check for node replacement (same name, different identifiers)
        if node.name in nodes_data:
            existing_node = nodes_data[node.name]
            existing_ip = existing_node.get('internal_ip')
            existing_hostname = existing_node.get('hostname')
            existing_kubelet = existing_node.get('kubelet_version')
            
            new_ip = node_dict.get('internal_ip')
            new_hostname = node_dict.get('hostname')
            new_kubelet = node_dict.get('kubelet_version')
            
            # Detect replacement if key identifiers differ
            is_replacement = False
            if existing_ip and new_ip and existing_ip != new_ip:
                is_replacement = True
            elif existing_hostname and new_hostname and existing_hostname != new_hostname:
                is_replacement = True
            elif existing_kubelet and new_kubelet and existing_kubelet != new_kubelet:
                is_replacement = True
            
            if is_replacement:
                logger.info(
                    f"Node replacement detected for {node.name}: "
                    f"IP {existing_ip} -> {new_ip}, "
                    f"hostname {existing_hostname} -> {new_hostname}"
                )
                # Preserve location data if available, otherwise let geolocation update it
                if existing_node.get('lat') and not node_dict.get('lat'):
                    node_dict['lat'] = existing_node.get('lat')
                if existing_node.get('lon') and not node_dict.get('lon'):
                    node_dict['lon'] = existing_node.get('lon')
                if existing_node.get('location') and not node_dict.get('location'):
                    node_dict['location'] = existing_node.get('location')
        
        # Store node data
        nodes_data[node.name] = node_dict
        
        # Store connection data separately if provided
        if node.connections:
            connections_data[node.name] = node.connections
            logger.info(f"Received data from node: {node.name} with {len(node.connections)} connections")
        else:
            logger.info(f"Received data from node: {node.name}")
        
        return {
            "status": "success",
            "message": f"Data received from {node.name}",
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error receiving node data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/nodes", response_model=List[NodeStatus])
async def get_all_nodes():
    """Get status of all nodes for frontend"""
    try:
        # Clean up stale nodes before returning data
        _cleanup_stale_nodes()
        
        current_time = time.time()
        nodes_status = []
        
        for node_name, node_data in nodes_data.items():
            last_seen_timestamp = node_data.get('received_at', node_data.get('timestamp', 0))
            time_diff = current_time - last_seen_timestamp
            
            # Determine node status
            if time_diff < 60:
                status = "online"
            elif time_diff < NODE_TIMEOUT:
                status = "warning"
            else:
                status = "offline"
            
            # Calculate last seen human-readable time
            if time_diff < 60:
                last_seen = f"{int(time_diff)}s ago"
            elif time_diff < 3600:
                last_seen = f"{int(time_diff / 60)}m ago"
            else:
                last_seen = f"{int(time_diff / 3600)}h ago"
            
            nodes_status.append(NodeStatus(
                name=node_data.get('name', node_name),
                hostname=node_data.get('hostname', node_name),
                internal_ip=node_data.get('internal_ip'),
                external_ip=node_data.get('external_ip'),
                lat=node_data.get('lat'),
                lon=node_data.get('lon'),
                location=node_data.get('location'),
                provider=node_data.get('provider'),
                status=status,
                cpu_percent=node_data.get('cpu_percent'),
                memory_percent=node_data.get('memory_percent'),
                disk_percent=node_data.get('disk_percent'),
                network_tx_bytes_per_sec=node_data.get('network_tx_bytes_per_sec'),
                network_rx_bytes_per_sec=node_data.get('network_rx_bytes_per_sec'),
                last_seen_timestamp=last_seen_timestamp,
                last_seen=last_seen,
                kubelet_version=node_data.get('kubelet_version'),
                # Extended metrics
                cpu_temp_celsius=node_data.get('cpu_temp_celsius'),
                temp_critical=node_data.get('temp_critical'),
                fan_rpm=node_data.get('fan_rpm'),
                cpu_freq_mhz=node_data.get('cpu_freq_mhz'),
                cpu_freq_max_mhz=node_data.get('cpu_freq_max_mhz'),
                uptime_seconds=node_data.get('uptime_seconds'),
                load_avg_1m=node_data.get('load_avg_1m'),
                load_avg_5m=node_data.get('load_avg_5m'),
                load_avg_15m=node_data.get('load_avg_15m'),
                swap_percent=node_data.get('swap_percent'),
                memory_total_bytes=node_data.get('memory_total_bytes'),
                memory_available_bytes=node_data.get('memory_available_bytes'),
                disk_read_bytes_per_sec=node_data.get('disk_read_bytes_per_sec'),
                disk_write_bytes_per_sec=node_data.get('disk_write_bytes_per_sec'),
                network_errin=node_data.get('network_errin'),
                network_errout=node_data.get('network_errout'),
                network_dropin=node_data.get('network_dropin'),
                network_dropout=node_data.get('network_dropout'),
                process_count=node_data.get('process_count'),
            ))
        
        return nodes_status
        
    except Exception as e:
        logger.error(f"Error getting nodes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/nodes/{node_name}")
async def get_node_details(node_name: str):
    """Get detailed information for a specific node"""
    if node_name not in nodes_data:
        raise HTTPException(status_code=404, detail=f"Node {node_name} not found")
    
    return nodes_data[node_name]


@app.delete("/api/nodes/{node_name}")
async def remove_node(node_name: str):
    """Remove a node from tracking (admin endpoint)"""
    if node_name not in nodes_data:
        raise HTTPException(status_code=404, detail=f"Node {node_name} not found")
    
    del nodes_data[node_name]
    logger.info(f"Removed node: {node_name}")
    
    return {"status": "success", "message": f"Node {node_name} removed"}


@app.get("/api/connections")
async def get_all_connections():
    """Get network connections between all nodes"""
    try:
        # Build a list of all connections with source and target info
        all_connections = []
        
        for source_node, connections in connections_data.items():
            if source_node in nodes_data:
                source_info = nodes_data[source_node]
                
                for conn in connections:
                    # Convert Connection object to dict if needed
                    if hasattr(conn, 'model_dump'):
                        conn_dict = conn.model_dump()
                    elif isinstance(conn, dict):
                        conn_dict = conn
                    else:
                        conn_dict = dict(conn)
                    
                    all_connections.append({
                        'source_node': source_node,
                        'source_lat': source_info.get('lat'),
                        'source_lon': source_info.get('lon'),
                        'target_node': conn_dict.get('target_node'),
                        'target_lat': nodes_data.get(conn_dict.get('target_node'), {}).get('lat'),
                        'target_lon': nodes_data.get(conn_dict.get('target_node'), {}).get('lon'),
                        'latency_ms': conn_dict.get('latency_ms', 0),
                        'min_ms': conn_dict.get('min_ms'),
                        'max_ms': conn_dict.get('max_ms'),
                    })
        
        if DEDUP_CONNECTIONS:
            deduped = {}
            for conn in all_connections:
                key = tuple(sorted([conn.get('source_node'), conn.get('target_node')]))
                existing = deduped.get(key)
                if not existing or conn.get('latency_ms', 0) < existing.get('latency_ms', 0):
                    deduped[key] = conn
            all_connections = list(deduped.values())

        if MAX_CONNECTIONS > 0 and len(all_connections) > MAX_CONNECTIONS:
            all_connections = sorted(
                all_connections, key=lambda c: c.get('latency_ms', 0)
            )[:MAX_CONNECTIONS]

        return all_connections
        
    except Exception as e:
        logger.error(f"Error getting connections: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats")
async def get_cluster_stats():
    """Get aggregated cluster statistics"""
    try:
        current_time = time.time()
        online_nodes = 0
        total_cpu = 0.0
        total_memory = 0.0
        total_disk = 0.0
        total_network_tx = 0.0
        total_network_rx = 0.0
        providers = {}
        
        for node_data in nodes_data.values():
            last_seen = node_data.get('received_at', node_data.get('timestamp', 0))
            if current_time - last_seen < NODE_TIMEOUT:
                online_nodes += 1
                
                if node_data.get('cpu_percent'):
                    total_cpu += node_data['cpu_percent']
                if node_data.get('memory_percent'):
                    total_memory += node_data['memory_percent']
                if node_data.get('disk_percent'):
                    total_disk += node_data['disk_percent']
                if node_data.get('network_tx_bytes_per_sec') is not None:
                    total_network_tx += node_data['network_tx_bytes_per_sec']
                if node_data.get('network_rx_bytes_per_sec') is not None:
                    total_network_rx += node_data['network_rx_bytes_per_sec']
                
                provider = node_data.get('provider', 'unknown')
                providers[provider] = providers.get(provider, 0) + 1
        
        node_count = len(nodes_data)
        
        return {
            "total_nodes": node_count,
            "online_nodes": online_nodes,
            "offline_nodes": node_count - online_nodes,
            "avg_cpu_percent": round(total_cpu / online_nodes, 2) if online_nodes > 0 else 0,
            "avg_memory_percent": round(total_memory / online_nodes, 2) if online_nodes > 0 else 0,
            "avg_disk_percent": round(total_disk / online_nodes, 2) if online_nodes > 0 else 0,
            "avg_network_tx_bytes_per_sec": round(total_network_tx / online_nodes, 2) if online_nodes > 0 else 0,
            "avg_network_rx_bytes_per_sec": round(total_network_rx / online_nodes, 2) if online_nodes > 0 else 0,
            "providers": providers,
            "total_connections": len(connections_data),
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting cluster stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _compute_metrics_hash(node_data: dict) -> str:
    """Compute a hash of key metrics to detect significant changes"""
    # Use floor division to bucket metrics - avoids cache invalidation on minor changes
    # Use `or 0` to handle None values (nodes may have missing metrics)
    cpu = int((node_data.get('cpu_percent') or 0) / 10) * 10  # Floor to 10% bucket
    mem = int((node_data.get('memory_percent') or 0) / 10) * 10
    uptime_days = int((node_data.get('uptime_seconds') or 0) / 86400)  # Days
    # Include temp and load since they're used in the quote prompt
    temp = int((node_data.get('cpu_temp_celsius') or 0) / 5) * 5  # Floor to 5°C bucket
    load = int((node_data.get('load_avg_1m') or 0) * 2) / 2  # Floor to 0.5 bucket

    key = f"{cpu}:{mem}:{uptime_days}:{temp}:{load}"
    return hashlib.md5(key.encode()).hexdigest()[:8]


def _format_uptime(seconds: Optional[float]) -> str:
    """Format uptime in human-readable form"""
    if not seconds or seconds < 0:
        return "unknown"

    days = int(seconds / 86400)
    hours = int((seconds % 86400) / 3600)

    if days > 0:
        return f"{days} days"
    return f"{hours} hours"


async def _generate_quote(character: str, node_name: str, node_data: dict) -> str:
    """Generate a quote using OpenAI API"""
    if not openai_client:
        return FALLBACK_QUOTES.get(character, "That's what she said.")

    # Build metrics string
    metrics_parts = [f"Node: {node_name}"]

    if node_data.get('cpu_percent') is not None:
        metrics_parts.append(f"CPU: {node_data['cpu_percent']:.0f}%")

    if node_data.get('memory_percent') is not None:
        metrics_parts.append(f"Memory: {node_data['memory_percent']:.0f}%")

    if node_data.get('uptime_seconds'):
        metrics_parts.append(f"Uptime: {_format_uptime(node_data['uptime_seconds'])}")

    if node_data.get('cpu_temp_celsius') is not None:
        metrics_parts.append(f"Temperature: {node_data['cpu_temp_celsius']:.0f}°C")

    if node_data.get('load_avg_1m') is not None:
        metrics_parts.append(f"Load: {node_data['load_avg_1m']:.2f}")

    metrics_str = ", ".join(metrics_parts)

    # Character name mapping for more natural prompts
    character_names = {
        'michael': 'Michael Scott',
        'dwight': 'Dwight Schrute',
        'jim': 'Jim Halpert',
        'pam': 'Pam Beesly',
        'angela': 'Angela Martin',
        'kevin': 'Kevin Malone',
        'stanley': 'Stanley Hudson',
        'phyllis': 'Phyllis Vance',
        'toby': 'Toby Flenderson',
        'oscar': 'Oscar Martinez',
        'creed': 'Creed Bratton',
        'meredith': 'Meredith Palmer',
        'andy': 'Andy Bernard',
        'ryan': 'Ryan Howard',
        'kelly': 'Kelly Kapoor',
    }

    full_name = character_names.get(character, character.title())

    prompt = f"""You are a deadpan SRE comedian writing short quips for a homelab status dashboard.
Each machine is themed after a character from "The Office" (US).

Goal:
Write a single-line quote as if that character is speaking ABOUT THEIR CURRENT METRICS.

Rules:
- Capture the character's vibe using original wording.
- Reference 1–2 metrics explicitly (numbers or comparisons).
- Make it a relevant joke based on the metrics (CPU, memory, temp, disk, uptime, pods, etc.).
- Length: 8–20 words.
- No emojis.

Character: {full_name}
Node: {node_name}
Metrics: {metrics_str}

Quote:"""

    try:
        response = await openai_client.chat.completions.create(
            model="gpt-5.2",
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=100,
            temperature=0.9,
        )
        quote = response.choices[0].message.content.strip()
        # Remove surrounding quotes if present
        if quote.startswith('"') and quote.endswith('"'):
            quote = quote[1:-1]
        return quote
    except Exception as e:
        logger.error(f"OpenAI API error: {e}")
        return FALLBACK_QUOTES.get(character, "That's what she said.")


@app.post("/api/quote/{node_name}")
async def get_node_quote(node_name: str, request: QuoteRequest):
    """Get an AI-generated quote for a specific node based on its character.

    Requires password authentication for interactive mode.
    """
    # Validate password
    if not INTERACTIVE_PASSWORD:
        raise HTTPException(
            status_code=503,
            detail="Interactive mode not configured"
        )
    if request.password != INTERACTIVE_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    if node_name not in nodes_data:
        raise HTTPException(status_code=404, detail=f"Node {node_name} not found")

    node_data = nodes_data[node_name]

    # Extract character name from node_name (e.g., "dwight-pi" -> "dwight")
    character = node_name.split('-')[0].lower()

    # Check cache (skip if force_new is requested)
    current_time = time.time()
    metrics_hash = _compute_metrics_hash(node_data)

    if not request.force_new and node_name in quote_cache:
        cached = quote_cache[node_name]
        age = current_time - cached.generated_at

        # Return cached quote if still valid (within TTL and metrics haven't changed significantly)
        if age < QUOTE_CACHE_TTL_SECONDS and cached.metrics_hash == metrics_hash:
            return {
                "node_name": node_name,
                "character": character,
                "quote": cached.quote,
                "cached": True,
                "cache_age_seconds": int(age),
            }

    # Generate new quote
    quote = await _generate_quote(character, node_name, node_data)

    # Cache the quote
    quote_cache[node_name] = QuoteCache(
        quote=quote,
        generated_at=current_time,
        metrics_hash=metrics_hash,
    )

    return {
        "node_name": node_name,
        "character": character,
        "quote": quote,
        "cached": False,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
