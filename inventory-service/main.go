// inventory-service owns the stock table.
//
//	GET  /health               -> {"status":"ok"}
//	GET  /stock/{productId}    -> {"productId":1,"quantity":20}
//	POST /stock/reserve        -> body {"productId":1,"quantity":2}; 409 if not enough stock
//
// Run with -healthcheck to call this service's own /health and exit 0 or 1.
// That lets a Dockerfile HEALTHCHECK work in an image with no shell or wget.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type reserveRequest struct {
	ProductID int `json:"productId"`
	Quantity  int `json:"quantity"`
}

type stockResponse struct {
	ProductID int `json:"productId"`
	Quantity  int `json:"quantity"`
}

func main() {
	healthcheck := flag.Bool("healthcheck", false, "call GET /health on this service and exit 0 if it answers 200")
	flag.Parse()

	port := env("PORT", "8081")

	if *healthcheck {
		os.Exit(runHealthcheck(port))
	}

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"),
		env("DB_HOST", "localhost"), env("DB_PORT", "5432"), env("DB_NAME", "shopdb"))

	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		log.Fatalf("db config: %v", err)
	}
	defer pool.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /stock/{productId}", getStock(pool))
	mux.HandleFunc("POST /stock/reserve", reserveStock(pool))

	srv := &http.Server{Addr: ":" + port, Handler: logRequests(mux)}

	go func() {
		log.Printf("inventory-service listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	// `docker stop` sends SIGTERM; finish in-flight requests, then exit.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGTERM, os.Interrupt)
	<-stop
	log.Println("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func getStock(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(r.PathValue("productId"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "productId must be an integer")
			return
		}

		var qty int
		err = pool.QueryRow(r.Context(), "SELECT quantity FROM stock WHERE product_id = $1", id).Scan(&qty)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "no stock record for this product")
			return
		}
		if err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, stockResponse{ProductID: id, Quantity: qty})
	}
}

func reserveStock(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req reserveRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ProductID <= 0 || req.Quantity <= 0 {
			writeError(w, http.StatusBadRequest, `body must be {"productId": int > 0, "quantity": int > 0}`)
			return
		}

		// One atomic statement: only decrements if enough stock is left.
		var left int
		err := pool.QueryRow(r.Context(),
			`UPDATE stock SET quantity = quantity - $2
			 WHERE product_id = $1 AND quantity >= $2
			 RETURNING quantity`, req.ProductID, req.Quantity).Scan(&left)
		if errors.Is(err, pgx.ErrNoRows) {
			// Either the product has no stock row, or there is not enough.
			var exists bool
			if err := pool.QueryRow(r.Context(),
				"SELECT EXISTS (SELECT 1 FROM stock WHERE product_id = $1)", req.ProductID).Scan(&exists); err != nil {
				internalError(w, err)
				return
			}
			if !exists {
				writeError(w, http.StatusNotFound, "no stock record for this product")
				return
			}
			writeError(w, http.StatusConflict, "not enough stock")
			return
		}
		if err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, stockResponse{ProductID: req.ProductID, Quantity: left})
	}
}

func runHealthcheck(port string) int {
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/health")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

// ---- small helpers ----

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func internalError(w http.ResponseWriter, err error) {
	log.Printf("error: %v", err)
	writeError(w, http.StatusInternalServerError, "internal error")
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// logRequests prints one line per request to stdout.
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		log.Printf("%s %s %d", r.Method, r.URL.Path, rec.status)
	})
}
