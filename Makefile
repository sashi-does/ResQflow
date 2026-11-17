.PHONY: setup dev backend frontend test lint fmt headless build start graph e2e

# Override if :8000 is taken, e.g. `make dev BACKEND_PORT=8010` (Vite proxies to it).
BACKEND_PORT ?= 8000
export BACKEND_PORT

setup:
	cd backend && uv sync
	cd frontend && npm install

# Backend on :8000 and Vite on :5173 (proxying /api and /ws). Ctrl-C stops both.
dev:
	@trap 'kill $$(jobs -p) 2>/dev/null' INT TERM EXIT; \
	(cd backend && exec uv run uvicorn app.main:app --reload --port $(BACKEND_PORT)) & \
	(cd frontend && exec npm run dev -- --port 5173 --strictPort) & \
	wait

backend:
	cd backend && uv run uvicorn app.main:app --reload --port $(BACKEND_PORT)

frontend:
	cd frontend && npm run dev

test:
	cd backend && uv run pytest -q

lint:
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd frontend && npm run lint

fmt:
	cd backend && uv run ruff check --fix . && uv run ruff format .

headless:
	cd backend && uv run python scripts/run_headless.py --scenario assam --until 24h

# Browser smoke test (system Chrome, ports 8010/5174). Screenshots -> docs/screenshots/
e2e:
	cd frontend && npx playwright test

graph:
	cd backend && uv run python scripts/build_road_graph.py

build:
	cd frontend && npm run build

start: build
	cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port $${PORT:-8000}
