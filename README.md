# ShopLite

A tiny online shop split into five containers. The application is deliberately
minimal; the real work in this project is the Docker / AWS / CI side.

| Service   | Folder               | Stack                  | Port | Table      | Endpoints                                                     |
|-----------|----------------------|------------------------|------|------------|---------------------------------------------------------------|
| frontend  | `frontend/`          | React (Vite)           | 80   | –          | UI; calls `/api/<service>/...`                                |
| catalog   | `catalog-service/`   | Node.js + Express      | 3000 | `products` | `GET /health`, `GET /products`, `GET /products/:id`, `POST /products` |
| inventory | `inventory-service/` | Go, `net/http`         | 8081 | `stock`    | `GET /health`, `GET /stock/:productId`, `POST /stock/reserve` |
| orders    | `order-service/`     | Java 21, Spring Boot   | 8082 | `orders`   | `GET /health`, `GET /orders`, `POST /orders`                  |
| postgres  | –                    | `postgres:17-alpine`   | 5432 | all three  | –                                                             |

`POST /orders {"productId":1,"quantity":2}` → orders asks catalog for the price
(unknown product → `400`), asks inventory to reserve stock (not enough → `409`),
then saves the order with `total = price × quantity` and returns `201`.

## Configuration

Every value comes from the environment; see [`.env.example`](.env.example).
Copy it to `.env` (git-ignored) and set real values.

## Running without Docker (for app development only)

Needs Postgres, Node 22+, Go 1.26, Java 21 + Maven.

```bash
# 1. database
createdb shopdb && psql -d shopdb -f db/init.sql

# 2. backends (each in its own terminal, with DB_* exported)
cd catalog-service && npm install && npm start            # :3000
cd inventory-service && go run .                           # :8081
cd order-service && mvn spring-boot:run                    # :8082

# 3. frontend: Vite proxies /api/* to the backends like nginx will
cd frontend && npm install && npm run dev                  # :5173
```

The inventory binary also supports `inventory-service -healthcheck`, which
calls its own `/health` and exits 0/1, for use in a distroless `HEALTHCHECK`.

## TODO (the actual project)

- [ ] Dockerfiles + `.dockerignore` for each service
- [ ] `frontend/nginx.conf` (template with `SERVER_NAME`, `/api/*` proxying, default `444` server)
- [ ] `scripts/up.sh`, `scripts/down.sh`
- [ ] `scripts/push.sh`, `scripts/deploy.sh`
- [ ] `.github/workflows/ci.yml`, `deploy.yml`
- [ ] `docs/evidence/`
