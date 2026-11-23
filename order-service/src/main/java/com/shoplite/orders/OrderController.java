package com.shoplite.orders;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

@RestController
public class OrderController {

    private static final Logger log = LoggerFactory.getLogger(OrderController.class);

    private static final RowMapper<Order> ORDER_ROW = (rs, i) -> new Order(
            rs.getInt("id"),
            rs.getInt("product_id"),
            rs.getInt("quantity"),
            rs.getBigDecimal("total"),
            rs.getTimestamp("created_at").toLocalDateTime());

    private final JdbcTemplate db;
    private final RestClient catalog;
    private final RestClient inventory;

    public OrderController(JdbcTemplate db,
                           RestClient.Builder http,
                           @Value("${shoplite.catalog-url}") String catalogUrl,
                           @Value("${shoplite.inventory-url}") String inventoryUrl) {
        this.db = db;
        this.catalog = http.clone().baseUrl(catalogUrl).build();
        this.inventory = http.clone().baseUrl(inventoryUrl).build();
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }

    @GetMapping("/orders")
    public List<Order> list() {
        return db.query("SELECT * FROM orders ORDER BY id DESC", ORDER_ROW);
    }

    @PostMapping("/orders")
    public ResponseEntity<?> create(@RequestBody OrderRequest req) {
        if (req.productId() == null || req.quantity() == null || req.productId() <= 0 || req.quantity() <= 0) {
            return error(HttpStatus.BAD_REQUEST, "body must be {\"productId\": int > 0, \"quantity\": int > 0}");
        }

        // 1. Ask catalog for the price. Unknown product -> 400.
        Map<?, ?> product;
        try {
            product = catalog.get().uri("/products/{id}", req.productId()).retrieve().body(Map.class);
        } catch (HttpClientErrorException.NotFound e) {
            return error(HttpStatus.BAD_REQUEST, "unknown product " + req.productId());
        }
        BigDecimal price = new BigDecimal(String.valueOf(product.get("price")));

        // 2. Ask inventory to reserve the stock. Not enough -> pass inventory's 409 on.
        try {
            inventory.post().uri("/stock/reserve").body(req).retrieve().toBodilessEntity();
        } catch (HttpClientErrorException e) {
            return ResponseEntity.status(e.getStatusCode()).body(e.getResponseBodyAs(Map.class));
        }

        // 3. Save the order and return the saved row.
        BigDecimal total = price.multiply(BigDecimal.valueOf(req.quantity()));
        Order saved = db.queryForObject(
                "INSERT INTO orders (product_id, quantity, total) VALUES (?, ?, ?) RETURNING *",
                ORDER_ROW, req.productId(), req.quantity(), total);

        log.info("order {} created: product={} quantity={} total={}",
                saved.id(), saved.productId(), saved.quantity(), saved.total());
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    private static ResponseEntity<Map<String, String>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("error", message));
    }
}
