import { Node } from '../types';

export interface NodeInsight {
  node: Node;
  severity: number;
  reasons: string[];
  primaryReason: string | null;
}

const WARNING_AGE_SECONDS = 60;
const CRITICAL_AGE_SECONDS = 180;

const isThrottling = (current?: number, max?: number): boolean => {
  if (current == null || max == null || max <= 0) {
    return false;
  }

  return current < max * 0.85;
};

export const getNodeTrafficTotal = (node: Node): number => {
  return (node.network_tx_bytes_per_sec ?? 0) + (node.network_rx_bytes_per_sec ?? 0);
};

export const getNodeLastSeenAgeSeconds = (
  node: Node,
  nowMs: number = Date.now()
): number | null => {
  if (node.last_seen_timestamp != null && !Number.isNaN(node.last_seen_timestamp)) {
    return Math.max(0, Math.floor(nowMs / 1000) - node.last_seen_timestamp);
  }

  if (!node.last_seen) {
    return null;
  }

  const numeric = Number(node.last_seen);
  if (!Number.isNaN(numeric)) {
    return Math.max(0, Math.floor(nowMs / 1000) - numeric);
  }

  const parsed = Date.parse(node.last_seen);
  if (!Number.isNaN(parsed)) {
    return Math.max(0, Math.floor((nowMs - parsed) / 1000));
  }

  return null;
};

export const getNodeInsight = (
  node: Node,
  nowMs: number = Date.now()
): NodeInsight => {
  const reasons: string[] = [];
  let severity = 0;
  const lastSeenAgeSeconds = getNodeLastSeenAgeSeconds(node, nowMs);
  const tempCritical = node.temp_critical ?? 85;

  if (node.status === 'offline') {
    severity += 120;
    reasons.push('Offline');
  } else if (node.status === 'warning') {
    severity += 70;
    reasons.push('Warning status');
  }

  if (lastSeenAgeSeconds != null && lastSeenAgeSeconds >= CRITICAL_AGE_SECONDS) {
    severity += 55;
    reasons.push(`Heartbeat stale (${Math.floor(lastSeenAgeSeconds / 60)}m)`);
  } else if (lastSeenAgeSeconds != null && lastSeenAgeSeconds >= WARNING_AGE_SECONDS) {
    severity += 25;
    reasons.push(`Heartbeat drifting (${lastSeenAgeSeconds}s)`);
  }

  if ((node.cpu_percent ?? 0) >= 85) {
    severity += 24;
    reasons.push(`CPU ${node.cpu_percent?.toFixed(0)}%`);
  }

  if ((node.memory_percent ?? 0) >= 85) {
    severity += 22;
    reasons.push(`Memory ${node.memory_percent?.toFixed(0)}%`);
  }

  if ((node.disk_percent ?? 0) >= 90) {
    severity += 20;
    reasons.push(`Disk ${node.disk_percent?.toFixed(0)}%`);
  }

  if ((node.swap_percent ?? 0) >= 50) {
    severity += 18;
    reasons.push(`Swap ${node.swap_percent?.toFixed(0)}%`);
  }

  if (node.cpu_temp_celsius != null && node.cpu_temp_celsius >= tempCritical * 0.9) {
    severity += 16;
    reasons.push(`CPU hot at ${node.cpu_temp_celsius.toFixed(0)}C`);
  }

  if (isThrottling(node.cpu_freq_mhz, node.cpu_freq_max_mhz)) {
    severity += 12;
    reasons.push('Frequency throttled');
  }

  if ((node.network_errin ?? 0) > 0 || (node.network_errout ?? 0) > 0 || (node.network_dropin ?? 0) > 0 || (node.network_dropout ?? 0) > 0) {
    severity += 10;
    reasons.push('Network errors reported');
  }

  return {
    node,
    severity,
    reasons,
    primaryReason: reasons[0] ?? null,
  };
};

export const getAttentionNodes = (
  nodes: Node[],
  maxItems: number = nodes.length,
  nowMs: number = Date.now()
): NodeInsight[] => {
  return nodes
    .map((node) => getNodeInsight(node, nowMs))
    .filter((insight) => insight.severity > 0)
    .sort((left, right) => {
      if (right.severity !== left.severity) {
        return right.severity - left.severity;
      }

      return getNodeTrafficTotal(right.node) - getNodeTrafficTotal(left.node);
    })
    .slice(0, maxItems);
};
