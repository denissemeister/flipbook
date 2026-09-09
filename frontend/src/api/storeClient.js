// ── Store API client ──────────────────────────────────────────────────────────
// Handles both public store routes and customer-authed cart/checkout routes.
import { getCustomerToken } from '../stores/customerStore';

const BASE = '/api/v1/store';

async function request(method, path, body) {
  const token = getCustomerToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const storeApi = {
  get:    path        => request('GET',    path),
  post:   (path, b)   => request('POST',   path, b),
  patch:  (path, b)   => request('PATCH',  path, b),
  delete: path        => request('DELETE', path),
};
