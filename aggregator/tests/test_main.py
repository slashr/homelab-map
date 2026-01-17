"""Tests for the aggregator FastAPI service."""

from __future__ import annotations

from typing import Any, Dict, Iterable

import pytest

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import main


@pytest.fixture()
def anyio_backend() -> str:
    """Run AnyIO-powered tests using asyncio only."""
    return "asyncio"


@pytest.fixture(autouse=True)
def reset_state() -> Iterable[None]:
    """Ensure each test runs with a clean in-memory data store."""
    main.nodes_data.clear()
    main.connections_data.clear()
    main.quote_cache.clear()
    yield
    main.nodes_data.clear()
    main.connections_data.clear()
    main.quote_cache.clear()


def test_load_node_timeout_default_and_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """NODE_TIMEOUT_SECONDS env var should override the default seconds."""
    monkeypatch.delenv(main.NODE_TIMEOUT_ENV_VAR, raising=False)
    assert main._load_node_timeout() == main.DEFAULT_NODE_TIMEOUT_SECONDS

    monkeypatch.setenv(main.NODE_TIMEOUT_ENV_VAR, "300")
    assert main._load_node_timeout() == 300


def test_load_node_timeout_invalid_values_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Invalid values fall back to the default."""
    monkeypatch.setenv(main.NODE_TIMEOUT_ENV_VAR, "not-a-number")
    assert main._load_node_timeout() == main.DEFAULT_NODE_TIMEOUT_SECONDS

    monkeypatch.setenv(main.NODE_TIMEOUT_ENV_VAR, "-5")
    assert main._load_node_timeout() == main.DEFAULT_NODE_TIMEOUT_SECONDS


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
                "network_tx_bytes_per_sec": 2048.0,
                "network_rx_bytes_per_sec": 1024.0,
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
    assert nodes["node-online"].last_seen_timestamp == pytest.approx(fixed_time - 30)
    assert nodes["node-online"].last_seen == "30s ago"
    assert nodes["node-online"].network_tx_bytes_per_sec == pytest.approx(2048.0)
    assert nodes["node-online"].network_rx_bytes_per_sec == pytest.approx(1024.0)
    assert nodes["node-warning"].status == "warning"
    assert nodes["node-warning"].last_seen_timestamp == pytest.approx(fixed_time - 90)
    assert nodes["node-warning"].last_seen == "1m ago"
    assert nodes["node-offline"].status == "offline"
    assert nodes["node-offline"].last_seen_timestamp == pytest.approx(fixed_time - 3600)
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
                "network_tx_bytes_per_sec": 3000.0,
                "network_rx_bytes_per_sec": 1500.0,
                "provider": "aws",
            },
            "node-offline": {
                "name": "node-offline",
                "hostname": "node-offline",
                "received_at": fixed_time - (main.NODE_TIMEOUT + 10),
                "cpu_percent": 20.0,
                "memory_percent": 30.0,
                "disk_percent": 40.0,
                "network_tx_bytes_per_sec": 10.0,
                "network_rx_bytes_per_sec": 5.0,
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
    assert stats["avg_network_tx_bytes_per_sec"] == pytest.approx(3000.0)
    assert stats["avg_network_rx_bytes_per_sec"] == pytest.approx(1500.0)
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


def test_load_cleanup_grace_period_default_and_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """CLEANUP_GRACE_PERIOD_SECONDS env var should override the default seconds."""
    monkeypatch.delenv(main.CLEANUP_GRACE_PERIOD_ENV_VAR, raising=False)
    assert main._load_cleanup_grace_period() == main.DEFAULT_CLEANUP_GRACE_PERIOD_SECONDS

    monkeypatch.setenv(main.CLEANUP_GRACE_PERIOD_ENV_VAR, "3600")
    assert main._load_cleanup_grace_period() == 3600


def test_load_cleanup_grace_period_invalid_values_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Invalid values fall back to the default."""
    monkeypatch.setenv(main.CLEANUP_GRACE_PERIOD_ENV_VAR, "not-a-number")
    assert main._load_cleanup_grace_period() == main.DEFAULT_CLEANUP_GRACE_PERIOD_SECONDS

    monkeypatch.setenv(main.CLEANUP_GRACE_PERIOD_ENV_VAR, "-5")
    assert main._load_cleanup_grace_period() == main.DEFAULT_CLEANUP_GRACE_PERIOD_SECONDS


@pytest.mark.anyio
async def test_cleanup_stale_nodes_removes_old_nodes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Test that stale nodes beyond grace period are removed."""
    fixed_time = 1_700_000_000.0
    monkeypatch.setattr(main.time, "time", lambda: fixed_time)
    
    # Set a short grace period for testing
    monkeypatch.setenv(main.CLEANUP_GRACE_PERIOD_ENV_VAR, "100")
    # Reload the grace period
    main.CLEANUP_GRACE_PERIOD = main._load_cleanup_grace_period()
    
    # Add nodes with different ages
    main.nodes_data.update(
        {
            "node-recent": {
                "name": "node-recent",
                "hostname": "node-recent",
                "received_at": fixed_time - 30,  # Recent
            },
            "node-stale": {
                "name": "node-stale",
                "hostname": "node-stale",
                "received_at": fixed_time - (main.NODE_TIMEOUT + 200),  # Beyond grace period
            },
        }
    )
    
    # Add connections for stale node
    main.connections_data["node-stale"] = [
        main.Connection(
            target_node="node-recent",
            target_ip="10.0.0.2",
            latency_ms=10.0,
        )
    ]
    main.connections_data["node-recent"] = [
        main.Connection(
            target_node="node-stale",
            target_ip="10.0.0.1",
            latency_ms=10.0,
        )
    ]
    
    # Call cleanup
    main._cleanup_stale_nodes()
    
    # Verify stale node is removed
    assert "node-stale" not in main.nodes_data
    assert "node-recent" in main.nodes_data
    
    # Verify connections are cleaned up
    assert "node-stale" not in main.connections_data
    # Connection from node-recent to node-stale should be removed
    assert len(main.connections_data.get("node-recent", [])) == 0


@pytest.mark.anyio
async def test_node_replacement_detection_same_name_different_ip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Test that node replacement is detected when IP changes."""
    fixed_time = 1_700_000_000.0
    monkeypatch.setattr(main.time, "time", lambda: fixed_time)
    
    # Add initial node
    await main.receive_node_data(
        main.NodeData(
            name="node-1",
            hostname="node-1.local",
            internal_ip="10.0.0.1",
            kubelet_version="v1.28.0",
            lat=37.7749,
            lon=-122.4194,
        )
    )
    
    original_received_at = main.nodes_data["node-1"]["received_at"]
    
    # Simulate time passing
    monkeypatch.setattr(main.time, "time", lambda: fixed_time + 100)
    
    # Send data for same node name but different IP (replacement)
    await main.receive_node_data(
        main.NodeData(
            name="node-1",
            hostname="node-1.local",
            internal_ip="10.0.0.2",  # Different IP
            kubelet_version="v1.28.0",
            lat=37.7749,
            lon=-122.4194,
        )
    )
    
    # Node should still exist but with new IP
    assert main.nodes_data["node-1"]["internal_ip"] == "10.0.0.2"
    # Location should be preserved
    assert main.nodes_data["node-1"]["lat"] == pytest.approx(37.7749)
    assert main.nodes_data["node-1"]["lon"] == pytest.approx(-122.4194)


@pytest.mark.anyio
async def test_node_replacement_detection_same_name_different_hostname(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Test that node replacement is detected when hostname changes."""
    fixed_time = 1_700_000_000.0
    monkeypatch.setattr(main.time, "time", lambda: fixed_time)
    
    # Add initial node
    await main.receive_node_data(
        main.NodeData(
            name="node-1",
            hostname="node-1-old.local",
            internal_ip="10.0.0.1",
        )
    )
    
    # Simulate time passing
    monkeypatch.setattr(main.time, "time", lambda: fixed_time + 100)
    
    # Send data for same node name but different hostname (replacement)
    await main.receive_node_data(
        main.NodeData(
            name="node-1",
            hostname="node-1-new.local",  # Different hostname
            internal_ip="10.0.0.1",
        )
    )
    
    # Node should still exist but with new hostname
    assert main.nodes_data["node-1"]["hostname"] == "node-1-new.local"


@pytest.mark.anyio
async def test_node_replacement_detection_same_name_different_kubelet(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Test that node replacement is detected when kubelet version changes."""
    fixed_time = 1_700_000_000.0
    monkeypatch.setattr(main.time, "time", lambda: fixed_time)
    
    # Add initial node
    await main.receive_node_data(
        main.NodeData(
            name="node-1",
            hostname="node-1.local",
            internal_ip="10.0.0.1",
            kubelet_version="v1.27.0",
        )
    )
    
    # Simulate time passing
    monkeypatch.setattr(main.time, "time", lambda: fixed_time + 100)
    
    # Send data for same node name but different kubelet version (replacement)
    await main.receive_node_data(
        main.NodeData(
            name="node-1",
            hostname="node-1.local",
            internal_ip="10.0.0.1",
            kubelet_version="v1.29.0",  # Different kubelet version
        )
    )
    
    # Node should still exist but with new kubelet version
    assert main.nodes_data["node-1"]["kubelet_version"] == "v1.29.0"


@pytest.mark.anyio
async def test_node_replacement_preserves_location_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Test that location data is preserved during node replacement."""
    fixed_time = 1_700_000_000.0
    monkeypatch.setattr(main.time, "time", lambda: fixed_time)
    
    # Add initial node with location
    await main.receive_node_data(
        main.NodeData(
            name="node-1",
            hostname="node-1.local",
            internal_ip="10.0.0.1",
            lat=37.7749,
            lon=-122.4194,
        )
    )
    
    # Simulate time passing
    monkeypatch.setattr(main.time, "time", lambda: fixed_time + 100)
    
    # Send replacement node without location data
    await main.receive_node_data(
        main.NodeData(
            name="node-1",
            hostname="node-1.local",
            internal_ip="10.0.0.2",  # Different IP (replacement)
            # No lat/lon provided
        )
    )
    
    # Location should be preserved from original node
    assert main.nodes_data["node-1"]["lat"] == pytest.approx(37.7749)
    assert main.nodes_data["node-1"]["lon"] == pytest.approx(-122.4194)


# Quote endpoint tests


@pytest.mark.anyio
async def test_get_node_quote_returns_404_for_unknown_node() -> None:
    """Test that quote endpoint returns 404 for unknown nodes."""
    with pytest.raises(main.HTTPException) as exc_info:
        await main.get_node_quote("unknown-node")
    assert exc_info.value.status_code == 404


@pytest.mark.anyio
async def test_get_node_quote_returns_fallback_without_openai(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Test that quote endpoint returns fallback quote when OpenAI is not configured."""
    # Disable OpenAI client
    monkeypatch.setattr(main, "openai_client", None)

    # Add a node
    main.nodes_data["dwight-pi"] = {
        "name": "dwight-pi",
        "hostname": "dwight-pi",
        "cpu_percent": 45.0,
        "memory_percent": 60.0,
    }

    response = await main.get_node_quote("dwight-pi")

    assert response["node_name"] == "dwight-pi"
    assert response["character"] == "dwight"
    assert response["quote"] == main.FALLBACK_QUOTES["dwight"]
    assert response["cached"] is False


@pytest.mark.anyio
async def test_get_node_quote_caching(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Test that quotes are cached and reused within TTL."""
    fixed_time = 1_700_000_000.0
    monkeypatch.setattr(main.time, "time", lambda: fixed_time)
    monkeypatch.setattr(main, "openai_client", None)

    # Add a node
    main.nodes_data["michael-1"] = {
        "name": "michael-1",
        "hostname": "michael-1",
        "cpu_percent": 50.0,
        "memory_percent": 70.0,
    }

    # First call - should not be cached
    response1 = await main.get_node_quote("michael-1")
    assert response1["cached"] is False
    quote1 = response1["quote"]

    # Second call - should be cached
    response2 = await main.get_node_quote("michael-1")
    assert response2["cached"] is True
    assert response2["quote"] == quote1
    assert "cache_age_seconds" in response2


@pytest.mark.anyio
async def test_get_node_quote_cache_invalidation_on_metrics_change(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Test that cache is invalidated when metrics change significantly."""
    fixed_time = 1_700_000_000.0
    monkeypatch.setattr(main.time, "time", lambda: fixed_time)
    monkeypatch.setattr(main, "openai_client", None)

    # Add a node with initial metrics
    main.nodes_data["stanley-pi"] = {
        "name": "stanley-pi",
        "hostname": "stanley-pi",
        "cpu_percent": 20.0,
        "memory_percent": 30.0,
    }

    # First call
    response1 = await main.get_node_quote("stanley-pi")
    assert response1["cached"] is False

    # Update metrics significantly (CPU from 20% to 80%)
    main.nodes_data["stanley-pi"]["cpu_percent"] = 80.0

    # Second call - should generate new quote due to metrics change
    response2 = await main.get_node_quote("stanley-pi")
    assert response2["cached"] is False


@pytest.mark.anyio
async def test_get_node_quote_extracts_character_from_node_name() -> None:
    """Test that character is correctly extracted from node name."""
    # Test various node name formats
    test_cases = [
        ("dwight-pi", "dwight"),
        ("michael-1", "michael"),
        ("jim-server-2", "jim"),
        ("PAM-TEST", "pam"),
    ]

    for node_name, expected_character in test_cases:
        main.nodes_data[node_name] = {
            "name": node_name,
            "hostname": node_name,
        }
        response = await main.get_node_quote(node_name)
        assert response["character"] == expected_character, f"Failed for {node_name}"
        main.nodes_data.clear()
        main.quote_cache.clear()


def test_compute_metrics_hash_consistency() -> None:
    """Test that metrics hash is consistent for same values."""
    node_data = {
        "cpu_percent": 45.0,
        "memory_percent": 67.0,
        "uptime_seconds": 86400 * 5,  # 5 days
    }

    hash1 = main._compute_metrics_hash(node_data)
    hash2 = main._compute_metrics_hash(node_data)
    assert hash1 == hash2


def test_compute_metrics_hash_handles_none_values() -> None:
    """Test that metrics hash handles None values without raising TypeError."""
    # Node with all None metrics (e.g., newly added or offline node)
    node_data = {
        "cpu_percent": None,
        "memory_percent": None,
        "uptime_seconds": None,
        "cpu_temp_celsius": None,
        "load_avg_1m": None,
    }

    # Should not raise TypeError
    result = main._compute_metrics_hash(node_data)
    assert isinstance(result, str)
    assert len(result) == 8  # MD5 hex truncated to 8 chars


def test_compute_metrics_hash_floors_values() -> None:
    """Test that small metric changes don't affect hash (using floor division)."""
    # Values within same floor buckets:
    # CPU: 50-59 -> 50, Memory: 70-79 -> 70, Temp: 40-44 -> 40, Load: 1.0-1.49 -> 1.0
    node_data1 = {
        "cpu_percent": 51.0,
        "memory_percent": 71.0,
        "cpu_temp_celsius": 41.0,
        "load_avg_1m": 1.1,
    }
    node_data2 = {
        "cpu_percent": 58.0,  # Still floors to 50
        "memory_percent": 78.0,  # Still floors to 70
        "cpu_temp_celsius": 44.0,  # 44/5=8.8 -> int=8 -> 8*5=40
        "load_avg_1m": 1.4,  # 1.4*2=2.8 -> int=2 -> 2/2=1.0
    }

    hash1 = main._compute_metrics_hash(node_data1)
    hash2 = main._compute_metrics_hash(node_data2)
    assert hash1 == hash2


def test_format_uptime() -> None:
    """Test uptime formatting."""
    assert main._format_uptime(None) == "unknown"
    assert main._format_uptime(-1) == "unknown"
    assert main._format_uptime(3600) == "1 hours"  # 1 hour
    assert main._format_uptime(86400) == "1 days"  # 1 day
    assert main._format_uptime(86400 * 5 + 3600 * 3) == "5 days"  # 5 days
