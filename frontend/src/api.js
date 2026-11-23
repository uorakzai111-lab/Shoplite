// Relative URLs only. The browser is not on any Docker network, so it can't
// resolve "catalog" or "orders". nginx (or the Vite dev proxy) forwards these.

async function request(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body;
}

export const api = {
  health: (service) => request(`/api/${service}/health`),
  products: () => request('/api/catalog/products'),
  stock: (productId) => request(`/api/inventory/stock/${productId}`),
  orders: () => request('/api/orders/orders'),
  createOrder: (productId, quantity) =>
    request('/api/orders/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantity }),
    }),
};
