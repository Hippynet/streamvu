# StreamVU Dashboard - Development Commands
# Run `make help` for available commands

.PHONY: help install lint test build clean dev dev-rebuild

# Default target
help:
	@echo "StreamVU Dashboard Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install      Install all dependencies + hooks"
	@echo "  make hooks        Install git hooks only"
	@echo ""
	@echo "Development (Docker):"
	@echo "  make dev          Start full stack in Docker (API + Web + DB + TURN)"
	@echo "  make dev-rebuild  Rebuild and restart all containers"
	@echo "  make dev-stop     Stop all containers"
	@echo "  make dev-logs     Show container logs"
	@echo "  make dev-api      Start API container only (with DB)"
	@echo "  make dev-web      Start Web container only"
	@echo "  make dev-shared   Watch shared package for changes (local)"
	@echo ""
	@echo "Quality (Continuous):"
	@echo "  make watch        Run tests in watch mode"
	@echo "  make watch-api    Run API tests in watch mode"
	@echo "  make watch-web    Run Web tests in watch mode"
	@echo ""
	@echo "Quality (One-time):"
	@echo "  make lint         Run all linters"
	@echo "  make lint-fix     Run linters with auto-fix"
	@echo "  make format       Format all code with Prettier"
	@echo "  make format-check Check formatting without changes"
	@echo "  make typecheck    Run TypeScript type checking"
	@echo "  make test         Run all tests"
	@echo "  make coverage     Run tests with coverage"
	@echo ""
	@echo "Build:"
	@echo "  make build        Build all packages"
	@echo "  make build-shared Build shared package only"
	@echo "  make build-api    Build API package only"
	@echo "  make build-web    Build Web package only"
	@echo ""
	@echo "Services:"
	@echo "  make services-up    Start all services (DB + TURN)"
	@echo "  make services-down  Stop all services"
	@echo ""
	@echo "Database:"
	@echo "  make db-migrate   Create and apply migrations"
	@echo "  make db-push      Push schema changes (no migration)"
	@echo "  make db-reset     Reset database (destructive!)"
	@echo "  make db-seed      Run database seed"
	@echo "  make db-studio    Open Prisma Studio"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean        Clean build artifacts"
	@echo "  make check        Run all checks (lint + typecheck + test + build)"
	@echo "  make ci           Run CI simulation"
	@echo ""
	@echo "URLs (when dev is running):"
	@echo "  API:        http://localhost:3002"
	@echo "  Web:        http://localhost:3003"
	@echo "  DB Studio:  http://localhost:5555 (via make db-studio)"

# ============================================================================
# SETUP
# ============================================================================

install:
	@echo "📦 Installing dependencies..."
	pnpm install
	@$(MAKE) hooks
	@echo "✅ All dependencies installed"

hooks:
	@echo "🪝 Installing git hooks..."
	pnpm exec husky
	@echo "✅ Hooks installed"

# ============================================================================
# DEVELOPMENT
# ============================================================================

dev:
	@echo "🚀 Starting development environment (Docker)..."
	@echo ""
	docker compose up -d
	@echo ""
	@echo "⏳ Waiting for database to be ready..."
	@sleep 3
	@echo "📦 Syncing database schema..."
	docker compose exec -T api pnpm --filter @streamvu/api exec prisma db push --accept-data-loss 2>/dev/null || echo "⚠️  Schema sync skipped (API may still be starting)"
	@echo ""
	@echo "Services running:"
	@echo "  API:     http://localhost:3002"
	@echo "  Web:     http://localhost:3003"
	@echo "  DB:      localhost:5433"
	@echo "  TURN:    turn:localhost:3478 (user: streamvu)"
	@echo ""
	@echo "📋 Showing logs (Ctrl+C to stop watching)..."
	docker compose logs -f

dev-stop:
	@echo "🛑 Stopping development environment..."
	docker compose down

dev-logs:
	@echo "📋 Showing logs..."
	docker compose logs -f

dev-api:
	@echo "🚀 Starting API container only..."
	docker compose up -d db api
	docker compose logs -f api

dev-web:
	@echo "🚀 Starting Web container only..."
	docker compose up -d web
	docker compose logs -f web

dev-shared:
	@echo "👀 Watching shared package..."
	pnpm --filter @streamvu/shared dev

dev-rebuild:
	@echo "🔄 Stopping and rebuilding all containers..."
	@echo ""
	docker compose down
	docker compose up --build -d
	@echo ""
	@echo "⏳ Waiting for database to be ready..."
	@sleep 3
	@echo "📦 Syncing database schema..."
	docker compose exec -T api pnpm --filter @streamvu/api exec prisma db push --accept-data-loss || echo "⚠️  Schema sync failed, may need manual migration"
	@echo ""
	@echo "✅ All containers rebuilt and running"
	@echo ""
	@echo "Services running:"
	@echo "  API:     http://localhost:3002"
	@echo "  Web:     http://localhost:3003"
	@echo "  DB:      localhost:5433"
	@echo ""
	@echo "📋 Showing logs (Ctrl+C to stop watching)..."
	docker compose logs -f

# ============================================================================
# CONTINUOUS QUALITY (Watch Mode)
# ============================================================================

watch:
	@echo "👀 Running tests in watch mode..."
	pnpm test:watch

watch-api:
	@echo "👀 Watching API tests..."
	pnpm --filter @streamvu/api test:watch

watch-web:
	@echo "👀 Watching Web tests..."
	pnpm --filter @streamvu/web test:watch

# ============================================================================
# QUALITY (One-time)
# ============================================================================

lint:
	@echo "🔍 Running linters..."
	pnpm lint

lint-fix:
	@echo "🔧 Running linters with auto-fix..."
	pnpm lint:fix

format:
	@echo "✨ Formatting code..."
	pnpm format

format-check:
	@echo "🔍 Checking formatting..."
	pnpm format:check

typecheck:
	@echo "🔍 Running TypeScript type checking..."
	pnpm typecheck

test:
	@echo "🧪 Running tests..."
	pnpm test

coverage:
	@echo "📊 Running tests with coverage..."
	pnpm test:coverage

# ============================================================================
# BUILD
# ============================================================================

build: build-shared build-api build-web
	@echo "✅ Build complete"

build-shared:
	@echo "🔨 Building shared package..."
	pnpm --filter @streamvu/shared build

build-api: build-shared
	@echo "🔨 Building API..."
	pnpm --filter @streamvu/api build

build-web: build-shared
	@echo "🔨 Building Web..."
	pnpm --filter @streamvu/web build

# ============================================================================
# SERVICES (Docker)
# ============================================================================

services-up:
	@echo "🐳 Starting services (DB + TURN)..."
	docker compose up -d
	@sleep 2
	@echo "✅ Services running:"
	@echo "   PostgreSQL: localhost:5433"
	@echo "   Coturn:     localhost:3478 (STUN/TURN)"

services-down:
	@echo "🛑 Stopping services..."
	docker compose down

# Legacy alias for db-up
db-up: services-up

db-down: services-down

db-migrate:
	@echo "📦 Creating and applying migrations..."
	pnpm --filter @streamvu/api db:migrate

db-push:
	@echo "📦 Pushing schema changes..."
	pnpm --filter @streamvu/api db:push

db-reset:
	@echo "⚠️  Resetting database..."
	pnpm --filter @streamvu/api db:reset

db-seed:
	@echo "🌱 Seeding database..."
	pnpm --filter @streamvu/api db:seed

db-studio:
	@echo "🔍 Opening Prisma Studio..."
	pnpm --filter @streamvu/api db:studio

db-generate:
	@echo "🔄 Generating Prisma client..."
	pnpm --filter @streamvu/api db:generate

# ============================================================================
# UTILITIES
# ============================================================================

clean:
	@echo "🧹 Cleaning..."
	rm -rf node_modules/.cache
	rm -rf packages/api/dist
	rm -rf packages/web/dist
	rm -rf packages/shared/dist
	rm -rf coverage
	@echo "✅ Clean complete"

clean-all: clean
	@echo "🧹 Deep cleaning (removing node_modules)..."
	rm -rf node_modules
	rm -rf packages/*/node_modules
	@echo "✅ Deep clean complete"

check: lint typecheck test build
	@echo "✅ All checks passed!"

# Run all quality gates (same as CI)
ci: lint format-check typecheck test build
	@echo "✅ CI simulation complete"

# Quick check (faster, skips build)
quick-check: lint typecheck test
	@echo "✅ Quick check passed!"
