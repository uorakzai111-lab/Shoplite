-- Runs once, on the first start of an empty Postgres data volume.
-- POSTGRES_DB (shopdb) is created by the postgres image itself.

CREATE TABLE IF NOT EXISTS products (
    id    SERIAL PRIMARY KEY,
    name  TEXT           NOT NULL,
    price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS stock (
    product_id INTEGER PRIMARY KEY REFERENCES products (id),
    quantity   INTEGER NOT NULL CHECK (quantity >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
    id         SERIAL PRIMARY KEY,
    product_id INTEGER        NOT NULL REFERENCES products (id),
    quantity   INTEGER        NOT NULL CHECK (quantity > 0),
    total      NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP      NOT NULL DEFAULT now()
);

INSERT INTO products (name, price) VALUES
    ('Keyboard', 4500),
    ('Mouse',    1800),
    ('Monitor', 32000);

INSERT INTO stock (product_id, quantity) VALUES
    (1, 20),
    (2, 50),
    (3,  5);
