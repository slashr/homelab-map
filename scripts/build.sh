#!/bin/bash
# Build and push Docker images for homelab-map

set -e

# Configuration
REGISTRY="${REGISTRY:-docker.io/dawker}"
VERSION="${VERSION:-latest}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"

echo "🏗️  Building homelab-map images..."
echo "Registry: $REGISTRY"
echo "Version: $VERSION"
echo "Platforms: $PLATFORMS"
echo ""

export KUBECONFIG=~/.kube/michael

# Ensure buildx is set up
if ! docker buildx ls | grep -q multiarch; then
    echo "🔧 Creating buildx instance for multi-arch builds..."
    docker buildx create --name multiarch --use
fi

# Use the multiarch builder
docker buildx use multiarch

# Build Agent
echo "📦 Building Agent (multi-arch)..."
docker buildx build \
    --platform "${PLATFORMS}" \
    -t "${REGISTRY}/homelab-map-agent:${VERSION}" \
    --push \
    ./agent
echo "✅ Agent built successfully"
echo ""

# Build Aggregator
echo "📦 Building Aggregator (multi-arch)..."
docker buildx build \
    --platform "${PLATFORMS}" \
    -t "${REGISTRY}/homelab-map-aggregator:${VERSION}" \
    --push \
    ./aggregator
echo "✅ Aggregator built successfully"
echo ""

# Build Frontend
echo "📦 Building Frontend (multi-arch)..."
docker buildx build \
    --platform "${PLATFORMS}" \
    -t "${REGISTRY}/homelab-map-frontend:${VERSION}" \
    --push \
    ./frontend
echo "✅ Frontend built successfully"
echo ""

echo "🎉 Build complete!"
echo ""
echo "✅ Multi-arch images pushed to ${REGISTRY}"
echo "   - Platforms: ${PLATFORMS}"
echo ""
echo "To deploy/update in k3s:"
echo "  kubectl rollout restart daemonset/homelab-map-agent -n homelab-map"
echo "  kubectl rollout restart deployment/homelab-map-aggregator -n homelab-map"
echo "  kubectl rollout restart deployment/homelab-map-frontend -n homelab-map"
