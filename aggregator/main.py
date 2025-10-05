#!/usr/bin/env python3
"""
Homelab K3s Aggregator - Central API service
Receives data from agents and serves to frontend
"""

import time
import logging
from typing import Dict, List, Optional
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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

# In-memory storage for node data (can be replaced with Redis/DB later)
nodes_data: Dict[str, dict] = {}
NODE_TIMEOUT = 120  # Consider node offline if no update in 2 minutes


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
    cpu_percent: Optional[float] = None
    memory_percent: Optional[float] = None
    disk_percent: Optional[float] = None
    network_interfaces: Optional[List[str]] = None
    timestamp: float = Field(default_factory=time.time)


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
    last_seen: str
    kubelet_version: Optional[str] = None


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
        
        nodes_data[node.name] = node_dict
        
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
                last_seen=last_seen,
                kubelet_version=node_data.get('kubelet_version')
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


@app.get("/api/stats")
async def get_cluster_stats():
    """Get aggregated cluster statistics"""
    try:
        current_time = time.time()
        online_nodes = 0
        total_cpu = 0
        total_memory = 0
        total_disk = 0
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
            "providers": providers,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting cluster stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
