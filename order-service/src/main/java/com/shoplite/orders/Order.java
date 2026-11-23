package com.shoplite.orders;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record Order(int id, int productId, int quantity, BigDecimal total, LocalDateTime createdAt) {
}
