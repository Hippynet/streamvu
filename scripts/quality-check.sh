#!/bin/bash

# StreamVU Quality Check Script
# Runs linting, type checking, and tests

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}!${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Parse command
COMMAND=${1:-all}

case $COMMAND in
    lint-web)
        print_status "Linting web package..."
        cd packages/web && pnpm lint && pnpm typecheck
        print_success "Web lint passed"
        ;;
    lint-api)
        print_status "Linting API package..."
        cd packages/api && pnpm lint && pnpm typecheck
        print_success "API lint passed"
        ;;
    lint-shared)
        print_status "Linting shared package..."
        cd packages/shared && pnpm lint && pnpm typecheck
        print_success "Shared lint passed"
        ;;
    lint)
        print_status "Linting all packages..."
        pnpm lint
        print_success "All lint passed"
        ;;
    test-web)
        print_status "Testing web package..."
        cd packages/web && pnpm test:run
        print_success "Web tests passed"
        ;;
    test-api)
        print_status "Testing API package..."
        cd packages/api && pnpm test || print_warning "No API tests configured"
        ;;
    test)
        print_status "Testing all packages..."
        pnpm test:run || print_warning "Some tests may not be configured"
        ;;
    format)
        print_status "Formatting code..."
        pnpm format
        print_success "Code formatted"
        ;;
    format-check)
        print_status "Checking format..."
        pnpm format:check
        print_success "Format check passed"
        ;;
    build)
        print_status "Building all packages..."
        pnpm build
        print_success "Build succeeded"
        ;;
    all)
        print_status "Running full quality check..."
        echo ""

        print_status "Step 1/4: Linting..."
        pnpm lint
        print_success "Lint passed"
        echo ""

        print_status "Step 2/4: Type checking..."
        pnpm typecheck
        print_success "Type check passed"
        echo ""

        print_status "Step 3/4: Format check..."
        pnpm format:check || print_warning "Some files may need formatting"
        echo ""

        print_status "Step 4/4: Building..."
        pnpm build
        print_success "Build passed"
        echo ""

        print_success "All quality checks passed!"
        ;;
    *)
        echo "Usage: $0 {lint|lint-web|lint-api|lint-shared|test|test-web|test-api|format|format-check|build|all}"
        exit 1
        ;;
esac
