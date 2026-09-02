const BASE = '/api/v1';

let _accessToken = null;
let _refreshing   = null; // pending refresh promise — prevents multiple simultaneous refreshes

export function setToken(token) { _accessToken = token; }
export function getToken()      { return _accessToken; }

async function refreshToken() {
  if (_refreshing) return _refreshing;
  _refreshing = fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  }).then(async r => {
    _refreshing = null;
    if (!r.ok) throw new Error('refresh failed');
    const { accessToken } = await r.json();
    _accessToken = accessToken;
    return accessToken;
  }).catch(err => {
    _refreshing = null;
    throw err;
  });
  return _refreshing;
}

async function request(method, path, body, isRetry = false) {
  const headers = {};
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`;

  const isFormData = body instanceof FormData;
  if (!isFormData && body) headers['Content-Type'] = 'application/json';

  const res = await fetch(BASE + path, {
    method,
    headers,
    credentials: 'include',
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  // Token expired — try to refresh once then retry
  if (res.status === 401 && !isRetry) {
    try {
      await refreshToken();
      return request(method, path, body, true);
    } catch {
      _accessToken = null;
      window.location.href = '/login';
      return;
    }
  }

  if (!res.ok) {
    let errMsg = `Request failed (${res.status})`;
    try { errMsg = (await res.json()).error || errMsg; } catch {}
    throw new Error(errMsg);
  }

  // 204 No Content
  if (res.status === 204) return null;

  return res.json();
}

export const api = {
  get:    (path)              => request('GET',    path),
  post:   (path, body)        => request('POST',   path, body),
  patch:  (path, body)        => request('PATCH',  path, body),
  delete: (path)              => request('DELETE', path),
  upload: (path, formData)    => request('POST',   path, formData),
};
