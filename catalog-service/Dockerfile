FROM node:26-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# hadolint ignore=DL3018
RUN npm ci --omit=dev \
    && apk add --no-cache binutils \
    && mkdir -p /runtime-libs \
    && for lib in $(ldd /usr/local/bin/node); do \
         if [ -f "$lib" ]; then cp -L "$lib" /runtime-libs/; fi; \
       done \
    && rm -f /runtime-libs/ld-musl-* /runtime-libs/libc.musl-* \
    && strip --strip-unneeded /usr/local/bin/node /runtime-libs/*.so* \
    && find /app/node_modules -type f \( -name "*.md" -o -name "*.ts" -o -name "*.map" \) -delete

FROM alpine:3.21
RUN apk upgrade --no-cache
ENV LD_LIBRARY_PATH=/usr/local/lib
RUN adduser -D -u 1000 node
WORKDIR /app
COPY --from=builder /runtime-libs/ /usr/local/lib/
COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/
RUN chown -R 1000:1000 /app
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "-qO-", "http://127.0.0.1:3000/health"]
CMD ["node", "src/index.js"]
