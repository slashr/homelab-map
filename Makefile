.PHONY: help build deploy dev clean

REGISTRY ?= docker.io/yourusername
VERSION ?= latest

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build Docker images
	@./scripts/build.sh

deploy: ## Deploy to k3s cluster
	@./scripts/deploy.sh

dev: ## Run services locally for development
	@./scripts/dev.sh

status: ## Show deployment status
	@kubectl get all -n homelab-map

logs-agent: ## Show agent logs
	@kubectl logs -n homelab-map -l app=homelab-map-agent --tail=100 -f

logs-aggregator: ## Show aggregator logs
	@kubectl logs -n homelab-map -l app=homelab-map-aggregator --tail=100 -f

logs-frontend: ## Show frontend logs
	@kubectl logs -n homelab-map -l app=homelab-map-frontend --tail=100 -f

port-forward: ## Port forward frontend to localhost:3000
	@kubectl port-forward -n homelab-map svc/homelab-map-frontend 3000:80

clean: ## Remove deployment from k3s
	@kubectl delete namespace homelab-map --ignore-not-found=true

restart: ## Restart all deployments
	@kubectl rollout restart deployment -n homelab-map

update-images: ## Update deployment images
	@kubectl set image daemonset/homelab-map-agent -n homelab-map agent=$(REGISTRY)/homelab-map-agent:$(VERSION)
	@kubectl set image deployment/homelab-map-aggregator -n homelab-map aggregator=$(REGISTRY)/homelab-map-aggregator:$(VERSION)
	@kubectl set image deployment/homelab-map-frontend -n homelab-map frontend=$(REGISTRY)/homelab-map-frontend:$(VERSION)
