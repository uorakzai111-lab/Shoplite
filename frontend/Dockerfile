FROM node:22-alpine3.20 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src/ ./src/
RUN npm run build

FROM nginx:1.27-alpine-slim
# hadolint ignore=DL3018
RUN apk add --no-cache libcap \
    && setcap 'cap_net_bind_service=+ep' /usr/sbin/nginx \
    && chown -R 101:101 /var/cache/nginx /var/log/nginx /etc/nginx/conf.d \
    && touch /var/run/nginx.pid \
    && chown 101:101 /var/run/nginx.pid
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html
USER 101:101
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/bin/sh", "-c", "wget -qO- --header=\"Host: ${SERVER_NAME}\" http://127.0.0.1/health || exit 1"]
CMD ["nginx", "-g", "daemon off;"]
