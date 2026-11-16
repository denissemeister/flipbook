// ── Storykeeper-branded Cart Page ────────────────────────────────────────────
// Drop this file into: frontend/src/pages/CartPage.jsx

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { storeApi } from '../api/storeClient';
import { useCustomerStore } from '../stores/customerStore';

// ── Storykeeper design tokens ─────────────────────────────────────────────────
const T = {
  brand:      '#634D96',
  brandBg:    '#EDE8F8',
  brandText:  '#421F93',
  teal:       '#BAF7FD',
  pink:       '#EF9BBD',
  periwinkle: '#A0AFF1',
  purple:     '#9B70B8',
  white:      '#ffffff',
  border:     '#E8E0F7',
  text:       '#272235',
  muted:      '#7B6E99',
};

function formatPrice(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const COVER_PALETTES = [T.teal, T.pink, T.periwinkle, '#FDE68A', '#BBF7D0'];

// ── Cart item row ─────────────────────────────────────────────────────────────
function CartItem({ item, idx, onQuantityChange, onRemove, updating }) {
  const busy = updating === item.id;
  const bgColor = COVER_PALETTES[idx % COVER_PALETTES.length];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '16px 0', borderBottom: `1px solid ${T.border}`,
    }}>
      {/* Cover */}
      <div style={{
        width: 56, height: 72, borderRadius: 10, flexShrink: 0,
        background: bgColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, overflow: 'hidden',
      }}>
        {item.cover_image
          ? <img src={item.cover_image} alt={item.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : '📖'}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: "'Lexend', sans-serif",
        }}>
          {item.title}
        </div>
        <div style={{
          fontSize: 12, color: T.muted, textTransform: 'capitalize',
          fontFamily: "'Figtree', sans-serif",
        }}>
          {item.item_type}
        </div>
      </div>

      {/* Quantity controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onQuantityChange(item.id, item.quantity - 1)}
          disabled={busy || item.quantity <= 1}
          style={{ ...qtyBtn, opacity: (busy || item.quantity <= 1) ? .4 : 1 }}>
          −
        </button>
        <span style={{
          fontSize: 14, fontWeight: 600, color: T.text, minWidth: 20, textAlign: 'center',
          fontFamily: "'Lexend', sans-serif",
        }}>
          {item.quantity}
        </span>
        <button onClick={() => onQuantityChange(item.id, item.quantity + 1)}
          disabled={busy}
          style={{ ...qtyBtn, opacity: busy ? .4 : 1 }}>
          +
        </button>
      </div>

      {/* Price */}
      <div style={{
        fontSize: 14, fontWeight: 700, color: T.brandText, minWidth: 64, textAlign: 'right',
        fontFamily: "'Lexend', sans-serif",
      }}>
        {formatPrice(item.unit_price * item.quantity)}
      </div>

      {/* Remove */}
      <button onClick={() => onRemove(item.id)} disabled={busy}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', color: T.muted,
          fontSize: 18, padding: 4, lineHeight: 1, opacity: busy ? .4 : 1,
        }}
        title="Remove">
        ✕
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CartPage() {
  const navigate = useNavigate();
  const { token } = useCustomerStore();

  const [cart,        setCart]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [updating,    setUpdating]    = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error,       setError]       = useState('');

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
    <div style={{
      minHeight: '100vh',
      background: T.white,
      fontFamily: "'Figtree', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Nav */}
      <nav style={{
        background: T.white, borderBottom: `1px solid ${T.border}`,
        height: 60, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12,
        boxShadow: '0 1px 6px rgba(99,77,150,.08)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div onClick={() => navigate('/store')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>📚</span>
          <span style={{
            fontFamily: "'Lexend', sans-serif",
            fontSize: 17, fontWeight: 700, color: T.brandText, letterSpacing: -0.4,
          }}>
            Storykeeper
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => navigate('/store')} style={ghostBtn}>
          ← Continue Shopping
        </button>
      </nav>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{
          fontFamily: "'Lexend', sans-serif",
          fontSize: 26, fontWeight: 700, color: T.brandText, marginBottom: 32,
        }}>
          Your Cart
        </h1>

        {loading && (
          <div style={{ color: T.muted, fontSize: 14, fontFamily: "'Figtree', sans-serif" }}>
            Loading cart…
          </div>
        )}

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
            padding: '12px 16px', color: '#dc2626', fontSize: 13, marginBottom: 16,
            fontFamily: "'Figtree', sans-serif",
          }}>
            {error}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: .3 }}>🛒</div>
            <div style={{
              fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 10,
              fontFamily: "'Lexend', sans-serif",
            }}>
              Your cart is empty
            </div>
            <button onClick={() => navigate('/store')} style={primaryBtn}>Browse Books</button>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 28, alignItems: 'start' }}>

            {/* Item list */}
            <div style={{
              background: T.white, border: `1px solid ${T.border}`,
              borderRadius: 16, padding: '0 20px',
              boxShadow: '0 2px 12px rgba(99,77,150,.07)',
            }}>
              {items.map((item, i) => (
                <CartItem key={item.id} item={item} idx={i}
                  onQuantityChange={changeQty} onRemove={removeItem} updating={updating} />
              ))}
            </div>

            {/* Summary */}
            <div style={{
              background: T.brandBg, border: `1px solid ${T.border}`,
              borderRadius: 16, padding: 22,
              boxShadow: '0 2px 12px rgba(99,77,150,.07)',
              minWidth: 240,
            }}>
              <div style={{
                fontSize: 15, fontWeight: 700, color: T.brandText, marginBottom: 16,
                fontFamily: "'Lexend', sans-serif",
              }}>
                Order Summary
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: T.muted }}>Subtotal</span>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>
                  {formatPrice(cart.subtotal)}
                </span>
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

              <div style={{
                borderTop: `1px solid ${T.border}`, paddingTop: 12, marginTop: 8,
                display: 'flex', justifyContent: 'space-between', marginBottom: 20,
              }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Total</span>
                <span style={{
                  fontSize: 19, fontWeight: 800, color: T.brandText,
                  fontFamily: "'Lexend', sans-serif",
                }}>
                  {formatPrice(cart.total)}
                </span>
              </div>

              <button onClick={checkout} disabled={checkingOut}
                style={{ ...primaryBtn, width: '100%', fontSize: 14, padding: '13px 0', opacity: checkingOut ? .7 : 1 }}>
                {checkingOut ? 'Redirecting to payment…' : 'Checkout →'}
              </button>

              <div style={{
                marginTop: 12, display: 'flex', alignItems: 'center', gap: 6,
                justifyContent: 'center', color: T.muted, fontSize: 11,
              }}>
                🔒 Secure checkout via Stripe
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Primitives ────────────────────────────────────────────────────────────────
const primaryBtn = {
  padding: '10px 20px', borderRadius: 24, border: 'none', cursor: 'pointer',
  fontWeight: 700, fontSize: 13,
  background: '#634D96', color: '#fff',
  textAlign: 'center',
  fontFamily: "'Figtree', sans-serif",
};

const ghostBtn = {
  padding: '7px 14px', borderRadius: 7, border: `1px solid #E8E0F7`, cursor: 'pointer',
  fontWeight: 600, fontSize: 12,
  background: '#fff', color: '#634D96',
  fontFamily: "'Figtree', sans-serif",
};

const qtyBtn = {
  width: 28, height: 28, borderRadius: 6, border: `1px solid #E8E0F7`,
  background: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#634D96',
};
