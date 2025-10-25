"""Tests for the aggregator FastAPI service."""

from __future__ import annotations

from typing import Any, Dict, Iterable

import pytest

from .. import main


@pytest.fixture()
def anyio_backend() -> str:
    """Run AnyIO-powered tests using asyncio only."""
    return "asyncio"


@pytest.fixture(autouse=True)
def reset_state() -> Iterable[None]:
    """Ensure each test runs with a clean in-memory data store."""
    main.nodes_data.clear()
    main.connections_data.clear()
    yield
    main.nodes_data.clear()
    main.connections_data.clear()


@pytest.mark.anyio
async def test_receive_node_data_stores_payload_and_connections() -> None:
    payload: Dict[str, Any] = {
        "name": "node-1",
        "hostname": "node-1.local",
        "internal_ip": "10.0.0.1",
        "lat": 37.7749,
        "lon": -122.4194,
        "connections": [
            {
                "target_node": "node-2",
                "target_ip": "10.0.0.2",
                "latency_ms": 12.5,
                "min_ms": 10.0,
                "max_ms": 20.0,
            }
        ],
    }

    node = main.NodeData(**payload)
    response = await main.receive_node_data(node)

    assert response["status"] == "success"
    assert main.nodes_data["node-1"]["hostname"] == "node-1.local"
    assert "received_at" in main.nodes_data["node-1"]
    assert main.connections_data["node-1"][0].target_node == "node-2"


@pytest.mark.anyio
async def test_get_all_nodes_reports_statuses_based_on_last_seen(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixed_time = 1_700_000_000.0
    monkeypatch.setattr(main.time, "time", lambda: fixed_time)

    main.nodes_data.update(
        {
            "node-online": {
                "name": "node-online",
                "hostname": "node-online",
                "received_at": fixed_time - 30,
            },
            "node-warning": {
                "name": "node-warning",
                "hostname": "node-warning",
                "received_at": fixed_time - 90,
            },
            "node-offline": {
                "name": "node-offline",
                "hostname": "node-offline",
                "received_at": fixed_time - 3600,
            },
        }
    )

    response = await main.get_all_nodes()
    nodes = {node.name: node for node in response}
    assert nodes["node-online"].status == "online"
    assert nodes["node-online"].last_seen == "30s ago"
    assert nodes["node-warning"].status == "warning"
    assert nodes["node-warning"].last_seen == "1m ago"
    assert nodes["node-offline"].status == "offline"
    assert nodes["node-offline"].last_seen == "1h ago"


@pytest.mark.anyio
async def test_get_cluster_stats_counts_only_online_nodes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixed_time = 1_700_000_000.0
    monkeypatch.setattr(main.time, "time", lambda: fixed_time)

    main.nodes_data.update(
        {
            "node-online": {
                "name": "node-online",
                "hostname": "node-online",
                "received_at": fixed_time - 30,
                "cpu_percent": 50.0,
                "memory_percent": 60.0,
                "disk_percent": 70.0,
                "provider": "aws",
            },
            "node-offline": {
                "name": "node-offline",
                "hostname": "node-offline",
                "received_at": fixed_time - (main.NODE_TIMEOUT + 10),
                "cpu_percent": 20.0,
                "memory_percent": 30.0,
                "disk_percent": 40.0,
                "provider": "do",
            },
        }
    )
    main.connections_data["node-online"] = [
        {
            "target_node": "node-offline",
            "latency_ms": 15.0,
        }
    ]

    stats = await main.get_cluster_stats()
    assert stats["total_nodes"] == 2
    assert stats["online_nodes"] == 1
    assert stats["offline_nodes"] == 1
    assert stats["avg_cpu_percent"] == 50.0
    assert stats["avg_memory_percent"] == 60.0
    assert stats["avg_disk_percent"] == 70.0
    assert stats["providers"] == {"aws": 1}
    assert stats["total_connections"] == 1


@pytest.mark.anyio
async def test_get_all_connections_expands_connection_models() -> None:
    await main.receive_node_data(
        main.NodeData(
            name="node-2",
            hostname="node-2.local",
            lat=40.7128,
            lon=-74.0060,
        )
    )
    await main.receive_node_data(
        main.NodeData(
            name="node-1",
            hostname="node-1.local",
            lat=37.7749,
            lon=-122.4194,
            connections=[
                main.Connection(
                    target_node="node-2",
                    target_ip="10.0.0.2",
                    latency_ms=10.5,
                )
            ],
        )
    )

    connections = await main.get_all_connections()
    assert len(connections) == 1
    connection = connections[0]
    assert connection["source_node"] == "node-1"
    assert connection["target_node"] == "node-2"
    assert connection["source_lat"] == pytest.approx(37.7749)
    assert connection["target_lat"] == pytest.approx(40.7128)
    assert connection["latency_ms"] == pytest.approx(10.5)
