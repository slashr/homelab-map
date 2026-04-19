#!/bin/bash
# Deploy homelab-map manifests to a Kubernetes cluster.
#
# This repo focuses on building images; Kubernetes manifests may live in a separate repo.
# By default, this script deploys from ./k8s if it exists, otherwise it requires a
# manifests directory via env var.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

MANIFESTS_DIR="${HOMELAB_MAP_MANIFESTS_DIR:-}"
if [[ -z "${MANIFESTS_DIR}" ]]; then
  if [[ -d "$PROJECT_ROOT/k8s" ]]; then
    MANIFESTS_DIR="$PROJECT_ROOT/k8s"
  fi
fi

echo "🚀 Deploying homelab-map..."

if ! command -v kubectl >/dev/null 2>&1; then
  echo "❌ Error: kubectl is required for deployment"
  exit 1
fi

if [[ -z "${MANIFESTS_DIR}" ]]; then
  echo "❌ Error: No manifests directory found."
  echo ""
  echo "This repo does not currently include a ./k8s directory."
  echo "Set HOMELAB_MAP_MANIFESTS_DIR to a folder containing your homelab-map YAML manifests."
  echo ""
  echo "Example:"
  echo "  export HOMELAB_MAP_MANIFESTS_DIR=/path/to/your/manifests"
  echo "  make deploy"
  exit 1
fi

if [[ ! -d "${MANIFESTS_DIR}" ]]; then
  echo "❌ Error: HOMELAB_MAP_MANIFESTS_DIR does not exist: ${MANIFESTS_DIR}"
  exit 1
fi

echo "Manifests: ${MANIFESTS_DIR}"
echo ""

kubectl apply -f "${MANIFESTS_DIR}"

echo ""
echo "✅ Deploy applied"

