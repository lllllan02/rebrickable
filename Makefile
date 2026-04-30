.PHONY: help install dev start build lint test db-push db-generate setup clean

help:
	@echo "Available commands:"
	@echo "  make setup        Install dependencies and initialize the local database"
	@echo "  make install      Install dependencies"
	@echo "  make dev          Start the development server"
	@echo "  make start        Start the production server"
	@echo "  make build        Build the production app"
	@echo "  make lint         Run ESLint"
	@echo "  make test         Run tests"
	@echo "  make db-push      Apply schema to the local SQLite database"
	@echo "  make db-generate  Generate Drizzle migrations"
	@echo "  make clean        Remove Next.js build output"

setup: install db-push

install:
	pnpm install

dev:
	pnpm dev

start:
	pnpm start

build:
	pnpm build

lint:
	pnpm lint

test:
	pnpm test

db-push:
	mkdir -p "$$HOME/.rebrickable-manager"
	pnpm db:push

db-generate:
	pnpm db:generate

clean:
	rm -rf .next
