# ===== SGIT-CCTV — atajos de desarrollo =====
.PHONY: up down logs api-shell db-shell migrate seed generate studio reset

up:            ## Levanta toda la plataforma
	docker compose up -d --build

down:          ## Detiene la plataforma
	docker compose down

logs:          ## Logs de la API
	docker compose logs -f api

migrate:       ## Ejecuta migraciones Prisma (dev)
	cd backend && npx prisma migrate dev

generate:      ## Genera el cliente Prisma
	cd backend && npx prisma generate

seed:          ## Carga datos semilla (Pisco)
	cd backend && npx prisma db seed

studio:        ## Abre Prisma Studio
	cd backend && npx prisma studio

reset:         ## Reinicia la base de datos (¡borra datos!)
	cd backend && npx prisma migrate reset
