import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { storeApi } from '../api/storeClient';
import { useCustomerStore } from '../stores/customerStore';

const T = {
  bg:       '#f5f5f7',
  white:    '#ffffff',
  border:   '#e5e7eb',
  text:     '#111827',
  muted:    '#6b7280',
  accent:   '#6c63ff',
  accentBg: 'rgba(108,99,255,.08)',
};

function formatPrice(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

// ── Cart item row ─────────────────────────────────────────────────────────────
function CartItem({ item, onQuantityChange, onRemove, updating }) {
  const busy = updating === item.id;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16,
      padding: '16px 0', borderBottom: `1px solid ${T.border}` }}>
      {/* Cover */}
      <div style={{ width: 56, height: 72, borderRadius: 8, flexShrink: 0,
        background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, color: 'rgba(255,255,255,.25)', overflow: 'hidden' }}>
        {item.cover_image
          ? <img src={item.cover_image} alt={item.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : '◈'}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </div>
        <div style={{ fontSize: 12, color: T.muted, textTransform: 'capitalize' }}>
          {item.item_type}
        </div>
      </div>

      {/* Quantity controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onQuantityChange(item.id, item.quantity - 1)}
          disabled={busy || item.quantity <= 1}
          style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`,
            background: T.white, cursor: 'pointer', fontSize: 16, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.text, opacity: (busy || item.quantity <= 1) ? .4 : 1 }}>
          −
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.text, minWidth: 20, textAlign: 'center' }}>
          {item.quantity}
        </span>
        <button onClick={() => onQuantityChange(item.id, item.quantity + 1)}
          disabled={busy}
          style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`,
            background: T.white, cursor: 'pointer', fontSize: 16, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.text, opacity: busy ? .4 : 1 }}>
          +
        </button>
      </div>

      {/* Price */}
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, minWidth: 64, textAlign: 'right' }}>
        {formatPrice(item.unit_price * item.quantity)}
      </div>

      {/* Remove */}
      <button onClick={() => onRemove(item.id)} disabled={busy}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted,
          fontSize: 18, padding: 4, lineHeight: 1, opacity: busy ? .4 : 1 }}
        title="Remove">✕</button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CartPage() {
  const navigate = useNavigate();
  const { token } = useCustomerStore();

  const [cart,       setCart]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [updating,   setUpdating]   = useState(null);   // item id being updated
  const [checkingOut, setCheckingOut] = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (!token) { navigate('/account/login'); return; }
    storeApi.get('/cart')
      .then(setCart)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function changeQty(itemId, newQty) {
    if (newQty < 1) return;
    setUpdating(itemId);
    try {
      const updated = await storeApi.patch(`/cart/${itemId}`, { quantity: newQty });
      setCart(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating(null);
    }
  }

  async function removeItem(itemId) {
    setUpdating(itemId);
    try {
      const updated = await storeApi.delete(`/cart/${itemId}`);
      setCart(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating(null);
    }
  }

  async function checkout() {
    setCheckingOut(true);
    setError('');
    try {
      const { url } = await storeApi.post('/checkout');
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setCheckingOut(false);
    }
  }

  const items = cart?.items || [];

  return (
    <div style={{ minHeight: '100vh', background: T.bg,
      fontFamily: '-apple-system,BlinkMacSystemFont,"Inter",sans-serif' }}>

      {/* Nav */}
      <div style={{ background: T.white, borderBottom: `1px solid ${T.border}`,
        height: 56, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,.06)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -.3, cursor: 'pointer',
          background: 'linear-gradient(135deg,#6c63ff,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          onClick={() => navigate('/store')}>
          ◈ Flipbook
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => navigate('/store')}
          style={{ fontSize: 12, fontWeight: 600, color: T.muted, background: 'none',
            border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 14px', cursor: 'pointer' }}>
          ← Continue Shopping
        </button>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: T.text, marginBottom: 32 }}>Your Cart</h1>

        {loading && <div style={{ color: T.muted, fontSize: 13 }}>Loading cart…</div>}

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
            padding: '12px 16px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: .3 }}>🛒</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 8 }}>Your cart is empty</div>
            <button onClick={() => navigate('/store')} style={primaryBtn}>Browse Books</button>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, alignItems: 'start' }}>

            {/* Item list */}
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14,
              padding: '0 20px', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
              {items.map(item => (
                <CartItem key={item.id} item={item}
                  onQuantityChange={changeQty} onRemove={removeItem} updating={updating} />
              ))}
            </div>

            {/* Summary */}
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14,
              padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.06)', minWidth: 240 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 16 }}>Order Summary</div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: T.muted }}>Subtotal</span>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{formatPrice(cart.subtotal)}</span>
              </div>

              {cart.discount_percent > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#059669' }}>
                    Discount ({cart.discount_percent}%)
                  </span>
                  <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>
                    −{formatPrice(cart.discount_amount)}
                  </span>
                </div>
              )}

              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, marginTop: 8,
                display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Total</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: T.accent }}>{formatPrice(cart.total)}</span>
              </div>

              <button onClick={checkout} disabled={checkingOut}
                style={{ ...primaryBtn, width: '100%', fontSize: 14, padding: '12px 0',
                  opacity: checkingOut ? .7 : 1 }}>
                {checkingOut ? 'Redirecting to payment…' : 'Checkout →'}
              </button>

              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6,
                justifyContent: 'center', color: T.muted, fontSize: 11 }}>
                🔒 Secure checkout via Stripe
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const primaryBtn = {
  padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontWeight: 700, fontSize: 13, background: '#6c63ff', color: '#fff',
  textAlign: 'center',
};
