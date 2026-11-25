import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const SERVICES = ['catalog', 'inventory', 'orders'];

const money = (n) =>
  typeof n === 'number' ? n.toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : n;

function StatusBar() {
  const [status, setStatus] = useState({});

  useEffect(() => {
    const check = () =>
      SERVICES.forEach((s) =>
        api
          .health(s)
          .then((b) => setStatus((prev) => ({ ...prev, [s]: b.status === 'ok' })))
          .catch(() => setStatus((prev) => ({ ...prev, [s]: false }))),
      );
    check();
    const timer = setInterval(check, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="status-bar">
      {SERVICES.map((s) => (
        <span key={s} className={status[s] === undefined ? 'pending' : status[s] ? 'up' : 'down'}>
          {s}
        </span>
      ))}
    </div>
  );
}

function StockBadge({ stock }) {
  if (stock === undefined || stock === null) return <span className="badge muted">—</span>;
  if (stock === 0) return <span className="badge out">Out of stock</span>;
  if (stock <= 5) return <span className="badge low">{stock} left</span>;
  return <span className="badge ok">{stock} in stock</span>;
}

function Products({ products }) {
  return (
    <section>
      <h2>Products</h2>
      {products.length === 0 ? (
        <p className="empty">No products to show.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Name</th><th className="num">Price</th><th>Stock</th></tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="muted">#{p.id}</td>
                  <td className="strong">{p.name}</td>
                  <td className="num">{money(p.price)}</td>
                  <td><StockBadge stock={p.stock} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OrderForm({ products, onOrdered }) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const order = await api.createOrder(Number(productId || products[0]?.id), Number(quantity));
      setMessage({ ok: true, text: `Order #${order.id} placed. Total ${money(order.total)}` });
      onOrdered();
    } catch (err) {
      setMessage({ ok: false, text: `Order failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2>Place an order</h2>
      <form onSubmit={submit}>
        <label>
          Product
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="qty">
          Quantity
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </label>
        <button type="submit" disabled={products.length === 0 || busy}>
          {busy ? 'Placing…' : 'Place order'}
        </button>
      </form>
      {message && <p className={`notice ${message.ok ? 'ok' : 'err'}`} role="status">{message.text}</p>}
    </section>
  );
}

function Orders({ orders, products }) {
  const nameOf = (id) => products.find((p) => p.id === id)?.name ?? `#${id}`;
  return (
    <section>
      <h2>Orders</h2>
      {orders.length === 0 ? (
        <p className="empty">No orders yet. Place your first one above.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Product</th><th className="num">Qty</th><th className="num">Total</th><th>Created</th></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="muted">#{o.id}</td>
                  <td className="strong">{nameOf(o.productId)}</td>
                  <td className="num">{o.quantity}</td>
                  <td className="num">{money(o.total)}</td>
                  <td className="muted">{new Date(o.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await api.products();
      const withStock = await Promise.all(
        list.map((p) =>
          api.stock(p.id).then((s) => ({ ...p, stock: s.quantity })).catch(() => p),
        ),
      );
      setProducts(withStock);
      setOrders(await api.orders().catch(() => []));
      setError('');
    } catch (err) {
      setError(`Could not load products: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main>
      <header>
        <h1>ShopLite</h1>
        <StatusBar />
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      <Products products={products} />
      <OrderForm products={products} onOrdered={load} />
      <Orders orders={orders} products={products} />
    </main>
  );
}