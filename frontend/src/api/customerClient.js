// Separate API client for customer-facing routes.
// Uses a different cookie name (customer_refresh) and token store.
import { getCustomerToken, setCustomerToken } from '../stores/customerStore';

const BASE = '/api/v1/customer';

let _refreshing = null;

async function refreshToken() {
  if (_refreshing) return _refreshing;
  _refreshing = fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async r => {
      _refreshing = null;
      if (!r.ok) throw new Error('refresh failed');
      const { accessToken } = await r.json();
      setCustomerToken(accessToken);
      return accessToken;
    })
    .catch(err => { _refreshing = null; throw err; });
  return _refreshing;
}

async function request(method, path, body, isRetry = false) {
  const token = getCustomerToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(BASE + path, {
    method,
    headers,
    credentials: 'include',
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !isRetry) {
    try {
      await refreshToken();
      return request(method, path, body, true);
    } catch {
      setCustomerToken(null);
      window.location.href = '/account/login';
      return;
    }
  }

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const customerApi = {
  get:    path       => request('GET',   path),
  post:   (path, b)  => request('POST',  path, b),
  patch:  (path, b)  => request('PATCH', path, b),
  delete: path       => request('DELETE', path),
};
