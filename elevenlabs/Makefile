# Makefile for ElevenLabs Miami Theater Voice Agent Integration

.PHONY: help install setup test clean

help: ## Show this help message
	@echo "Miami Theater Voice Agent - ElevenLabs Integration"
	@echo "================================================="
	@echo ""
	@echo "Available commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies (Python)
	pip install -r requirements.txt

install-node: ## Install dependencies (Node.js)
	npm install

setup: ## Set up ElevenLabs agent (Python)
	@if [ ! -f .env ]; then \
		echo "Creating .env from template..."; \
		cp .env.example .env; \
		echo "Please edit .env with your credentials before running setup"; \
		exit 1; \
	fi
	python setup_agent.py

setup-node: ## Set up ElevenLabs agent (Node.js)
	@if [ ! -f .env ]; then \
		echo "Creating .env from template..."; \
		cp .env.example .env; \
		echo "Please edit .env with your credentials before running setup"; \
		exit 1; \
	fi
	node setup_agent.js

test: ## Test the integration
	@if [ ! -f agent_config.json ]; then \
		echo "No agent configuration found. Run 'make setup' first."; \
		exit 1; \
	fi
	python test_integration.py

validate-env: ## Validate environment variables
	@echo "Checking environment configuration..."
	@if [ -z "$$ELEVENLABS_API_KEY" ]; then \
		echo "❌ ELEVENLABS_API_KEY not set"; \
		exit 1; \
	else \
		echo "✅ ELEVENLABS_API_KEY is set"; \
	fi
	@if [ -z "$$VERCEL_APP_URL" ]; then \
		echo "❌ VERCEL_APP_URL not set"; \
		exit 1; \
	else \
		echo "✅ VERCEL_APP_URL is set: $$VERCEL_APP_URL"; \
	fi

clean: ## Remove generated files
	rm -f agent_config.json
	rm -f .env
	rm -rf __pycache__
	rm -rf node_modules

status: ## Show current configuration status
	@echo "ElevenLabs Integration Status"
	@echo "============================"
	@if [ -f .env ]; then \
		echo "✅ Environment file exists"; \
	else \
		echo "❌ Environment file missing"; \
	fi
	@if [ -f agent_config.json ]; then \
		echo "✅ Agent configured"; \
		echo "   Tool ID: $$(jq -r '.tool_id' agent_config.json 2>/dev/null || echo 'Unknown')"; \
		echo "   Agent ID: $$(jq -r '.agent_id' agent_config.json 2>/dev/null || echo 'Unknown')"; \
	else \
		echo "❌ Agent not configured"; \
	fi

# Development commands
dev-setup: install ## Full development setup
	@echo "Setting up development environment..."
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@echo "✅ Development setup complete"
	@echo "📝 Next: Edit .env file and run 'make setup'"

full-test: validate-env test ## Run full test suite
	@echo "All tests completed successfully! 🎉"