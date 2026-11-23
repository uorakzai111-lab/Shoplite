const express = require('express');
const db = require('./db');

const PORT = Number(process.env.PORT || 3000);
const app = express();
app.use(express.json());

// Log every request to stdout so `docker logs catalog` shows it.
app.use((req, res, next) => {
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode}`));
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/products', async (req, res) => {
  const { rows } = await db.query('SELECT id, name, price::float AS price FROM products ORDER BY id');
  res.json(rows);
});

app.get('/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be an integer' });

  const { rows } = await db.query('SELECT id, name, price::float AS price FROM products WHERE id = $1', [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'product not found' });
  res.json(rows[0]);
});

app.post('/products', async (req, res) => {
  const { name, price } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '' || typeof price !== 'number' || price < 0) {
    return res.status(400).json({ error: 'body must be {"name": string, "price": number >= 0}' });
  }

  const { rows } = await db.query(
    'INSERT INTO products (name, price) VALUES ($1, $2) RETURNING id, name, price::float AS price',
    [name.trim(), price],
  );
  res.status(201).json(rows[0]);
});

// Express 5 forwards errors from async handlers here.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

const server = app.listen(PORT, () => console.log(`catalog-service listening on :${PORT}`));

// `docker stop` sends SIGTERM; close cleanly instead of waiting to be killed.
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  server.close(() => db.end().then(() => process.exit(0)));
});
