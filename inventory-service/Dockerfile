FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o inventory .

FROM alpine:3.21
RUN apk upgrade --no-cache
RUN adduser -D -u 10001 appuser
WORKDIR /app
COPY --from=builder /app/inventory ./inventory
USER 10001:10001
EXPOSE 8081
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "-qO-", "http://127.0.0.1:8081/health"]
CMD ["./inventory"]
