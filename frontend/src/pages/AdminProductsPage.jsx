import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

const T = {
  bg:       '#f0f0f4',
  white:    '#ffffff',
  surface:  '#f9f9fb',
  border:   '#e5e7eb',
  text:     '#111827',
  muted:    '#6b7280',
  accent:   '#6c63ff',
  danger:   '#dc2626',
  dangerBg: '#fef2f2',
};

function formatPrice(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

// ── Generic confirm dialog ────────────────────────────────────────────────────
function Confirm({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: T.white, borderRadius: 14, padding: 28, maxWidth: 360, width: '100%',
        boxShadow: '0 16px 48px rgba(0,0,0,.15)' }}>
        <div style={{ fontSize: 14, color: T.text, marginBottom: 24, lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ ...ghostBtn, flex: 1 }}>Cancel</button>
          <button onClick={onConfirm} style={{ ...dangerBtn, flex: 1 }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Field helpers ─────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: T.muted,
        textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px',
  border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 13,
  color: T.text, background: T.white, outline: 'none', fontFamily: 'inherit',
};

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTS TAB
// ══════════════════════════════════════════════════════════════════════════════
function ProductsTab() {
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null);  // null | {} | {id,...}
  const [confirm,  setConfirm]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => { load(); }, []);

  function load() {
    setLoading(true);
    api.get('/admin/products').then(setProducts).catch(e => setError(e.message)).finally(() => setLoading(false));
  }

  async function save() {
    setSaving(true); setError('');
    try {
      if (editing.id) {
        const updated = await api.patch(`/admin/products/${editing.id}`, editing);
        setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
      } else {
        const created = await api.post('/admin/products', editing);
        setProducts(prev => [created, ...prev]);
      }
      setEditing(null);
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  async function del(id) {
    await api.delete(`/admin/products/${id}`);
    setProducts(prev => prev.filter(p => p.id !== id));
    setConfirm(null);
  }

  const blank = { title: '', description: '', price: '', cover_image: '', status: 'draft', sort_order: 0 };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0 }}>Products</h2>
        <button onClick={() => setEditing(blank)} style={primaryBtn}>+ New Product</button>
      </div>

      {error && <div style={{ ...errorBox, marginBottom: 16 }}>{error}</div>}

      {loading && <div style={{ color: T.muted, fontSize: 13 }}>Loading…</div>}

      {/* Table */}
      {!loading && (
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {products.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: T.muted, fontSize: 13 }}>
              No products yet. Create your first one!
            </div>
          ) : products.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
              borderBottom: i < products.length - 1 ? `1px solid ${T.border}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{p.title}</div>
                <div style={{ fontSize: 12, color: T.muted }}>{p.book_title && `Book: ${p.book_title} · `}{formatPrice(p.price)}</div>
              </div>
              <StatusBadge status={p.status} />
              <button onClick={() => setEditing({ ...p })} style={ghostBtn}>Edit</button>
              <button onClick={() => setConfirm(p.id)} style={dangerGhostBtn}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {/* Edit / create modal */}
      {editing && (
        <Modal title={editing.id ? 'Edit Product' : 'New Product'} onClose={() => setEditing(null)}>
          {error && <div style={{ ...errorBox, marginBottom: 16 }}>{error}</div>}
          <Field label="Title *">
            <input style={inputStyle} value={editing.title}
              onChange={e => setEditing(p => ({ ...p, title: e.target.value }))} />
          </Field>
          <Field label="Description">
            <textarea rows={3} style={{ ...inputStyle, resize: 'vertical' }} value={editing.description}
              onChange={e => setEditing(p => ({ ...p, description: e.target.value }))} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Price (USD) *">
              <input type="number" min="0" step="0.01" style={inputStyle} value={editing.price}
                onChange={e => setEditing(p => ({ ...p, price: e.target.value }))} />
            </Field>
            <Field label="Sort Order">
              <input type="number" style={inputStyle} value={editing.sort_order}
                onChange={e => setEditing(p => ({ ...p, sort_order: +e.target.value }))} />
            </Field>
          </div>
          <Field label="Cover Image URL">
            <input style={inputStyle} value={editing.cover_image || ''}
              onChange={e => setEditing(p => ({ ...p, cover_image: e.target.value }))} />
          </Field>
          <Field label="Status">
            <select style={inputStyle} value={editing.status}
              onChange={e => setEditing(p => ({ ...p, status: e.target.value }))}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={() => setEditing(null)} style={{ ...ghostBtn, flex: 1 }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ ...primaryBtn, flex: 1, opacity: saving ? .7 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {confirm && (
        <Confirm message="Delete this product? This cannot be undone."
          onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BUNDLES TAB
// ══════════════════════════════════════════════════════════════════════════════
function BundlesTab() {
  const [bundles,  setBundles]  = useState([]);
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null);
  const [confirm,  setConfirm]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/admin/bundles'),
      api.get('/admin/products'),
    ]).then(([b, p]) => { setBundles(b); setProducts(p); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setError('');
    try {
      if (editing.id) {
        const updated = await api.patch(`/admin/bundles/${editing.id}`, editing);
        setBundles(prev => prev.map(b => b.id === updated.id ? { ...updated, products: editing.products } : b));
      } else {
        const created = await api.post('/admin/bundles', editing);
        setBundles(prev => [created, ...prev]);
      }
      setEditing(null);
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  async function del(id) {
    await api.delete(`/admin/bundles/${id}`);
    setBundles(prev => prev.filter(b => b.id !== id));
    setConfirm(null);
  }

  function toggleProduct(pid) {
    setEditing(prev => {
      const ids = prev.product_ids || [];
      return { ...prev, product_ids: ids.includes(pid) ? ids.filter(i => i !== pid) : [...ids, pid] };
    });
  }

  const blank = { title: '', description: '', price: '', cover_image: '', status: 'draft', sort_order: 0, product_ids: [] };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0 }}>Bundles</h2>
        <button onClick={() => setEditing(blank)} style={primaryBtn}>+ New Bundle</button>
      </div>

      {error && <div style={{ ...errorBox, marginBottom: 16 }}>{error}</div>}
      {loading && <div style={{ color: T.muted, fontSize: 13 }}>Loading…</div>}

      {!loading && (
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {bundles.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: T.muted, fontSize: 13 }}>No bundles yet.</div>
          ) : bundles.map((b, i) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
              borderBottom: i < bundles.length - 1 ? `1px solid ${T.border}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{b.title}</div>
                <div style={{ fontSize: 12, color: T.muted }}>
                  {formatPrice(b.price)} · {b.products?.length || 0} book{b.products?.length !== 1 ? 's' : ''}
                </div>
              </div>
              <StatusBadge status={b.status} />
              <button onClick={() => setEditing({ ...b, product_ids: (b.products || []).map(p => p.id) })} style={ghostBtn}>Edit</button>
              <button onClick={() => setConfirm(b.id)} style={dangerGhostBtn}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit Bundle' : 'New Bundle'} onClose={() => setEditing(null)}>
          {error && <div style={{ ...errorBox, marginBottom: 16 }}>{error}</div>}
          <Field label="Title *">
            <input style={inputStyle} value={editing.title}
              onChange={e => setEditing(p => ({ ...p, title: e.target.value }))} />
          </Field>
          <Field label="Description">
            <textarea rows={3} style={{ ...inputStyle, resize: 'vertical' }} value={editing.description}
              onChange={e => setEditing(p => ({ ...p, description: e.target.value }))} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Price (USD) *">
              <input type="number" min="0" step="0.01" style={inputStyle} value={editing.price}
                onChange={e => setEditing(p => ({ ...p, price: e.target.value }))} />
            </Field>
            <Field label="Status">
              <select style={inputStyle} value={editing.status}
                onChange={e => setEditing(p => ({ ...p, status: e.target.value }))}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          </div>
          <Field label="Products in this bundle">
            {products.length === 0 ? (
              <div style={{ fontSize: 12, color: T.muted }}>No products yet — create some first.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {products.map(p => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 13, color: T.text, cursor: 'pointer' }}>
                    <input type="checkbox"
                      checked={(editing.product_ids || []).includes(p.id)}
                      onChange={() => toggleProduct(p.id)} />
                    {p.title} ({formatPrice(p.price)})
                  </label>
                ))}
              </div>
            )}
          </Field>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={() => setEditing(null)} style={{ ...ghostBtn, flex: 1 }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ ...primaryBtn, flex: 1, opacity: saving ? .7 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {confirm && (
        <Confirm message="Delete this bundle?" onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DISCOUNTS TAB
// ══════════════════════════════════════════════════════════════════════════════
function DiscountsTab() {
  const [rules,   setRules]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.get('/admin/discounts').then(setRules).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setError('');
    try {
      if (editing.id) {
        const updated = await api.patch(`/admin/discounts/${editing.id}`, editing);
        setRules(prev => prev.map(r => r.id === updated.id ? updated : r));
      } else {
        const created = await api.post('/admin/discounts', editing);
        setRules(prev => [...prev, created].sort((a, b) => a.min_quantity - b.min_quantity));
      }
      setEditing(null);
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  async function del(id) {
    await api.delete(`/admin/discounts/${id}`);
    setRules(prev => prev.filter(r => r.id !== id));
    setConfirm(null);
  }

  const blank = { label: '', min_quantity: 2, discount_percent: '', active: true };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0 }}>Volume Discount Rules</h2>
        <button onClick={() => setEditing(blank)} style={primaryBtn}>+ New Rule</button>
      </div>

      {error && <div style={{ ...errorBox, marginBottom: 16 }}>{error}</div>}
      {loading && <div style={{ color: T.muted, fontSize: 13 }}>Loading…</div>}

      {!loading && (
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {rules.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: T.muted, fontSize: 13 }}>
              No discount rules yet. Add one to offer volume discounts!
            </div>
          ) : rules.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
              borderBottom: i < rules.length - 1 ? `1px solid ${T.border}` : 'none' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{r.label}</div>
                <div style={{ fontSize: 12, color: T.muted }}>
                  Buy {r.min_quantity}+ → {r.discount_percent}% off
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
                background: r.active ? '#dcfce7' : '#f3f4f6',
                color: r.active ? '#15803d' : T.muted }}>
                {r.active ? 'Active' : 'Inactive'}
              </span>
              <button onClick={() => setEditing({ ...r })} style={ghostBtn}>Edit</button>
              <button onClick={() => setConfirm(r.id)} style={dangerGhostBtn}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit Discount Rule' : 'New Discount Rule'} onClose={() => setEditing(null)}>
          {error && <div style={{ ...errorBox, marginBottom: 16 }}>{error}</div>}
          <Field label="Label (e.g. 'Buy 3, Save 10%') *">
            <input style={inputStyle} value={editing.label}
              onChange={e => setEditing(p => ({ ...p, label: e.target.value }))} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Min Quantity *">
              <input type="number" min="2" style={inputStyle} value={editing.min_quantity}
                onChange={e => setEditing(p => ({ ...p, min_quantity: +e.target.value }))} />
            </Field>
            <Field label="Discount % *">
              <input type="number" min="1" max="100" step="0.5" style={inputStyle} value={editing.discount_percent}
                onChange={e => setEditing(p => ({ ...p, discount_percent: e.target.value }))} />
            </Field>
          </div>
          <Field label="Status">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={editing.active}
                onChange={e => setEditing(p => ({ ...p, active: e.target.checked }))} />
              Active (show to customers)
            </label>
          </Field>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={() => setEditing(null)} style={{ ...ghostBtn, flex: 1 }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ ...primaryBtn, flex: 1, opacity: saving ? .7 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {confirm && (
        <Confirm message="Delete this discount rule?" onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
const TABS = ['Products', 'Bundles', 'Discounts'];

export default function AdminProductsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('Products');

  return (
    <div style={{ minHeight: '100vh', background: T.bg,
      fontFamily: '-apple-system,BlinkMacSystemFont,"Inter",sans-serif' }}>

      {/* Nav */}
      <div style={{ background: T.white, borderBottom: `1px solid ${T.border}`,
        height: 56, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,.06)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -.3, cursor: 'pointer',
          background: 'linear-gradient(135deg,#6c63ff,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          onClick={() => navigate('/admin')}>
          ◈ Flipbook
        </div>
        <span style={{ color: T.border }}>|</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>Store Management</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => navigate('/store')} style={ghostBtn}>View Store ↗</button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: '0 0 24px' }}>Store Management</h1>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28,
          background: T.white, border: `1px solid ${T.border}`, borderRadius: 10,
          padding: 4, width: 'fit-content' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '7px 20px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                background: tab === t ? T.accent : 'transparent',
                color: tab === t ? '#fff' : T.muted,
                transition: 'all .15s' }}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Products'  && <ProductsTab />}
        {tab === 'Bundles'   && <BundlesTab />}
        {tab === 'Discounts' && <DiscountsTab />}
      </div>
    </div>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: T.white, borderRadius: 16, padding: 28, maxWidth: 480, width: '100%',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.15)' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 20 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    active:   { bg: '#dcfce7', color: '#15803d' },
    draft:    { bg: '#f3f4f6', color: '#6b7280' },
    archived: { bg: '#fef3c7', color: '#d97706' },
  }[status] || { bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
      background: cfg.bg, color: cfg.color, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

const primaryBtn = {
  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontWeight: 600, fontSize: 13, background: '#6c63ff', color: '#fff',
};

const ghostBtn = {
  padding: '6px 14px', borderRadius: 7, border: `1px solid ${T.border}`, cursor: 'pointer',
  fontWeight: 600, fontSize: 12, background: T.white, color: T.text,
};

const dangerBtn = {
  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontWeight: 600, fontSize: 13, background: '#dc2626', color: '#fff',
};

const dangerGhostBtn = {
  padding: '6px 14px', borderRadius: 7, border: `1px solid #fecaca`, cursor: 'pointer',
  fontWeight: 600, fontSize: 12, background: '#fef2f2', color: '#dc2626',
};

const errorBox = {
  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
  padding: '10px 14px', color: '#dc2626', fontSize: 13,
};
