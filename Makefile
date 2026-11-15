REPO := eliot58/windro-ai
COMPOSE := docker compose -f docker-compose.yml

.PHONY: help update-env \
	install build lint test test-e2e \
	generate migrate migrate-deploy studio \
	up down restart ps logs logs-main build-image

help:
	@echo "Env:"
	@echo "  make update-env       - push .env.prod as the ENV_FILE GitHub secret"
	@echo ""
	@echo "Dev:"
	@echo "  make install          - npm install"
	@echo "  make build            - nest build"
	@echo "  make lint             - eslint --fix"
	@echo "  make test             - jest"
	@echo "  make test-e2e         - jest e2e"
	@echo ""
	@echo "Prisma:"
	@echo "  make generate         - prisma generate"
	@echo "  make migrate          - prisma migrate dev"
	@echo "  make migrate-deploy   - prisma migrate deploy"
	@echo "  make studio           - prisma studio"
	@echo ""
	@echo "Docker compose:"
	@echo "  make up               - start the stack (main, postgres)"
	@echo "  make down             - stop the stack"
	@echo "  make restart          - recreate containers from current images"
	@echo "  make ps               - list running containers"
	@echo "  make logs             - tail logs for all services"
	@echo "  make logs-main        - tail logs for the main API"
	@echo "  make build-image      - docker build the app image locally"

update-env:
	gh secret set ENV_FILE --repo $(REPO) < .env.prod

install:
	npm install

build:
	npm run build

lint:
	npm run lint

test:
	npm test

test-e2e:
	npm run test:e2e

generate:
	npx prisma generate

migrate:
	npx prisma migrate dev

migrate-deploy:
	npx prisma migrate deploy

studio:
	npx prisma studio

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) up -d --force-recreate --remove-orphans

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f --tail=200

logs-main:
	$(COMPOSE) logs -f --tail=200 windro-api

build-image:
	docker build -t ghcr.io/$(REPO):latest .
