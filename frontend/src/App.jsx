import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const SERVICES = ['catalog', 'inventory', 'orders'];

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

function Products({ products }) {
  return (
    <section>
      <h2>Products</h2>
      <table>
        <thead>
          <tr><th>ID</th><th>Name</th><th>Price</th><th>In stock</th></tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td>{p.name}</td>
              <td>{p.price}</td>
              <td>{p.stock ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function OrderForm({ products, onOrdered }) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    try {
      const order = await api.createOrder(Number(productId || products[0]?.id), Number(quantity));
      setMessage(`Order #${order.id} placed, total ${order.total}`);
      onOrdered();
    } catch (err) {
      setMessage(`Failed: ${err.message}`);
    }
  };

  return (
    <section>
      <h2>Place an order</h2>
      <form onSubmit={submit}>
        <select value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <button type="submit" disabled={products.length === 0}>Order</button>
      </form>
      {message && <p>{message}</p>}
    </section>
  );
}

function Orders({ orders }) {
  return (
    <section>
      <h2>Orders</h2>
      {orders.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <table>
          <thead>
            <tr><th>ID</th><th>Product</th><th>Qty</th><th>Total</th><th>Created</th></tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.productId}</td>
                <td>{o.quantity}</td>
                <td>{o.total}</td>
                <td>{new Date(o.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
      {error && <p className="error">{error}</p>}
      <Products products={products} />
      <OrderForm products={products} onOrdered={load} />
      <Orders orders={orders} />
    </main>
  );
}
