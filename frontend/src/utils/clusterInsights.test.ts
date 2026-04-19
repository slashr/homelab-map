import { Node } from '../types';
import {
  getAttentionNodes,
  getNodeInsight,
  getNodeLastSeenAgeSeconds,
  getNodeTrafficTotal,
} from './clusterInsights';

const baseNode: Node = {
  name: 'michael-1',
  hostname: 'michael-1',
  status: 'online',
  last_seen: '5s ago',
};

describe('clusterInsights', () => {
  it('sums total network traffic for a node', () => {
    expect(
      getNodeTrafficTotal({
        ...baseNode,
        network_tx_bytes_per_sec: 100,
        network_rx_bytes_per_sec: 250,
      })
    ).toBe(350);
  });

  it('prefers explicit timestamps when calculating heartbeat age', () => {
    expect(
      getNodeLastSeenAgeSeconds(
        {
          ...baseNode,
          last_seen_timestamp: 900,
        },
        1_000_000
      )
    ).toBe(100);
  });

  it('marks offline or overloaded nodes as needing attention', () => {
    const insight = getNodeInsight(
      {
        ...baseNode,
        status: 'offline',
        cpu_percent: 92,
        disk_percent: 94,
        last_seen_timestamp: 700,
      },
      1_000_000
    );

    expect(insight.severity).toBeGreaterThan(150);
    expect(insight.reasons).toContain('Offline');
    expect(insight.reasons).toContain('CPU 92%');
    expect(insight.reasons).toContain('Disk 94%');
  });

  it('sorts attention nodes by severity', () => {
    const nodes: Node[] = [
      {
        ...baseNode,
        name: 'jim-2',
        hostname: 'jim-2',
        status: 'warning',
        last_seen_timestamp: 970,
      },
      {
        ...baseNode,
        name: 'dwight-3',
        hostname: 'dwight-3',
        status: 'offline',
        last_seen_timestamp: 600,
      },
      {
        ...baseNode,
        name: 'pam-4',
        hostname: 'pam-4',
        status: 'online',
        last_seen_timestamp: 995,
      },
    ];

    const insights = getAttentionNodes(nodes, nodes.length, 1_000_000);

    expect(insights.map((insight) => insight.node.name)).toEqual(['dwight-3', 'jim-2']);
  });
});
