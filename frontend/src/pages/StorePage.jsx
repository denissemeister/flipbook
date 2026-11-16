// ── Storykeeper-branded Store Page ──────────────────────────────────────────
// Drop this file into: frontend/src/pages/StorePage.jsx
// (replaces the existing Flipbook-branded version)

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
  bg:         '#F9F7FE',
};

// Cycle through pastel cover colours for books without a cover image
const COVER_PALETTES = [T.teal, T.pink, T.periwinkle, '#FDE68A', '#BBF7D0', T.purple + '55'];

function formatPrice(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function coverStyle(idx) {
  return { background: COVER_PALETTES[idx % COVER_PALETTES.length] };
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav({ cartCount }) {
  const navigate = useNavigate();
  const { customer, logout } = useCustomerStore();

  function handleLogout() {
    storeApi.post('/cart', {}).catch(() => {});
    logout();
    navigate('/store');
  }

  return (
    <nav style={{
      background: T.white,
      borderBottom: `1px solid ${T.border}`,
      height: 60,
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: 12,
      boxShadow: '0 1px 6px rgba(99,77,150,.08)',
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      {/* Logo */}
      <div
        onClick={() => navigate('/store')}
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 22 }}>📚</span>
        <span style={{
          fontFamily: "'Lexend', sans-serif",
          fontSize: 17,
          fontWeight: 700,
          color: T.brandText,
          letterSpacing: -0.4,
        }}>
          Storykeeper
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {customer ? (
        <>
          <span style={{ fontSize: 12, color: T.muted, fontFamily: "'Figtree', sans-serif" }}>
            Hi, {customer.first_name || customer.email}
          </span>
          <button onClick={() => navigate('/account/orders')} style={ghostBtn}>My Orders</button>
          <button onClick={handleLogout} style={ghostBtn}>Sign out</button>
        </>
      ) : (
        <button onClick={() => navigate('/account/login')} style={ghostBtn}>Sign in</button>
      )}

      <button onClick={() => navigate('/store/cart')} style={{ ...ghostBtn, position: 'relative' }}>
        🛒 Cart
        {cartCount > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -6,
            background: T.brand, color: '#fff',
            borderRadius: '50%', width: 18, height: 18,
            fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {cartCount}
          </span>
        )}
      </button>
    </nav>
  );
}

// ── Wavy divider ─────────────────────────────────────────────────────────────
function WavyDivider({ from = T.brandBg, to = T.white, flip = false }) {
  return (
    <div style={{ display: 'block', lineHeight: 0, transform: flip ? 'scaleY(-1)' : 'none' }}>
      <svg viewBox="0 0 1440 56" xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', width: '100%' }} preserveAspectRatio="none">
        <path
          d="M0,28 C180,56 360,0 540,28 C720,56 900,0 1080,28 C1260,56 1380,14 1440,28 L1440,56 L0,56 Z"
          fill={to}
        />
        <rect x="0" y="0" width="1440" height="28" fill={from} />
      </svg>
    </div>
  );
}

// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({ product, idx, onAddToCart, adding }) {
  const busy = adding === product.id;
  return (
    <div style={{
      background: T.white,
      border: `1px solid ${T.border}`,
      borderRadius: 18,
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(99,77,150,.07)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'box-shadow .2s, transform .2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(99,77,150,.15)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(99,77,150,.07)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Cover */}
      <div style={{
        height: 180,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 56,
        ...coverStyle(idx),
      }}>
        {product.cover_image
          ? <img src={product.cover_image} alt={product.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : '📖'}
      </div>

      {/* Info */}
      <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {product.book_title && (
          <div style={{
            fontSize: 10, fontWeight: 700, color: T.brand, textTransform: 'uppercase',
            letterSpacing: .8, fontFamily: "'Figtree', sans-serif",
          }}>
            {product.book_title}
          </div>
        )}
        <div style={{
          fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.3,
          fontFamily: "'Lexend', sans-serif",
        }}>
          {product.title}
        </div>
        {product.description && (
          <div style={{
            fontSize: 13, color: T.muted, lineHeight: 1.55, flex: 1,
            fontFamily: "'Figtree', sans-serif",
          }}>
            {product.description}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <div style={{
            fontSize: 19, fontWeight: 700, color: T.brandText,
            fontFamily: "'Lexend', sans-serif",
          }}>
            {formatPrice(product.price)}
          </div>
          <button onClick={() => onAddToCart(product.id, 'product')} disabled={busy}
            style={{ ...primaryBtn, opacity: busy ? .7 : 1 }}>
            {busy ? 'Adding…' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bundle card ───────────────────────────────────────────────────────────────
function BundleCard({ bundle, onAddToCart, adding }) {
  const busy = adding === bundle.id;
  return (
    <div style={{
      background: T.white,
      border: `2px solid ${T.brand}`,
      borderRadius: 18,
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(99,77,150,.13)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Badge */}
      <div style={{
        background: T.brandBg,
        padding: '8px 18px',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 800, color: T.brand, textTransform: 'uppercase',
          letterSpacing: .9, fontFamily: "'Figtree', sans-serif",
        }}>
          ✨ Bundle — Best Value
        </span>
      </div>

      {/* Cover */}
      <div style={{
        height: 160,
        background: `linear-gradient(135deg, ${T.brand}, ${T.purple})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 44, color: 'rgba(255,255,255,.25)',
      }}>
        {bundle.cover_image
          ? <img src={bundle.cover_image} alt={bundle.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : '📚📖'}
      </div>

      {/* Info */}
      <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          fontSize: 15, fontWeight: 700, color: T.text,
          fontFamily: "'Lexend', sans-serif",
        }}>
          {bundle.title}
        </div>
        {bundle.description && (
          <div style={{
            fontSize: 13, color: T.muted, lineHeight: 1.55,
            fontFamily: "'Figtree', sans-serif",
          }}>
            {bundle.description}
          </div>
        )}
        {bundle.products?.length > 0 && (
          <div style={{ fontSize: 12, color: T.muted, fontFamily: "'Figtree', sans-serif" }}>
            Includes: {bundle.products.map(p => p.title).join(', ')}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <div style={{
            fontSize: 19, fontWeight: 700, color: T.brand,
            fontFamily: "'Lexend', sans-serif",
          }}>
            {formatPrice(bundle.price)}
          </div>
          <button onClick={() => onAddToCart(bundle.id, 'bundle')} disabled={busy}
            style={{ ...primaryBtn, opacity: busy ? .7 : 1 }}>
            {busy ? 'Adding…' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StorePage() {
  const navigate = useNavigate();
  const { token: customerToken } = useCustomerStore();

  const [products,  setProducts]  = useState([]);
  const [bundles,   setBundles]   = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [adding,    setAdding]    = useState(null);
  const [toast,     setToast]     = useState('');

  useEffect(() => {
    Promise.all([
      storeApi.get('/products'),
      storeApi.get('/bundles'),
      storeApi.get('/discounts'),
    ]).then(([p, b, d]) => {
      setProducts(p);
      setBundles(b);
      setDiscounts(d);
    }).finally(() => setLoading(false));

    if (customerToken) {
      storeApi.get('/cart').then(cart => setCartCount(cart.items?.length || 0)).catch(() => {});
    }
  }, [customerToken]);

  async function addToCart(id, type) {
    if (!customerToken) { navigate('/account/login'); return; }
    setAdding(id);
    try {
      const cart = await storeApi.post('/cart', type === 'product' ? { product_id: id } : { bundle_id: id });
      setCartCount(cart.items?.length || 0);
      showToast('Added to cart! 🎉');
    } catch (err) {
      showToast(err.message);
    } finally {
      setAdding(null);
    }
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: T.white,
      fontFamily: "'Figtree', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <Nav cartCount={cartCount} />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: T.brandText, color: '#fff', padding: '10px 22px',
          borderRadius: 12, fontSize: 13, fontWeight: 600, zIndex: 999,
          boxShadow: '0 4px 20px rgba(66,31,147,.3)',
          fontFamily: "'Figtree', sans-serif",
        }}>
          {toast}
        </div>
      )}

      {/* Hero */}
      <div style={{ background: T.brandBg, padding: '56px 24px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
        <h1 style={{
          fontFamily: "'Lexend', sans-serif",
          fontSize: 'clamp(26px, 5vw, 38px)',
          fontWeight: 700,
          color: T.brandText,
          margin: '0 0 12px',
          letterSpacing: -0.5,
        }}>
          Books that come alive<br />in your voice
        </h1>
        <p style={{
          fontSize: 15, color: T.muted, maxWidth: 460, margin: '0 auto 32px',
          lineHeight: 1.6, fontFamily: "'Figtree', sans-serif",
        }}>
          Choose a book, record your voice reading it aloud, and give the gift of your story — forever.
        </p>
      </div>
      <WavyDivider from={T.brandBg} to={T.white} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 60px' }}>

        {/* Volume discount banner */}
        {discounts.length > 0 && (
          <div style={{
            background: `linear-gradient(135deg, ${T.brand}, ${T.purple})`,
            borderRadius: 14, padding: '14px 24px', marginBottom: 40,
            display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
              fontFamily: "'Figtree', sans-serif",
            }}>
              🎉 Volume Discounts
            </span>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {discounts.map(d => (
                <span key={d.id} style={{
                  fontSize: 12, color: 'rgba(255,255,255,.9)',
                  background: 'rgba(255,255,255,.18)', borderRadius: 20,
                  padding: '4px 14px', fontWeight: 600,
                  fontFamily: "'Figtree', sans-serif",
                }}>
                  {d.label || `${d.min_quantity}+ books`}: {d.discount_percent}% off
                </span>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: T.muted, fontSize: 14 }}>
            Loading books…
          </div>
        )}

        {/* Bundles */}
        {!loading && bundles.length > 0 && (
          <section style={{ marginBottom: 52 }}>
            <h2 style={{
              fontFamily: "'Lexend', sans-serif",
              fontSize: 22, fontWeight: 700, color: T.brandText, marginBottom: 20,
            }}>
              Bundles
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
              {bundles.map(b => (
                <BundleCard key={b.id} bundle={b} onAddToCart={addToCart} adding={adding} />
              ))}
            </div>
          </section>
        )}

        {/* Products */}
        {!loading && products.length > 0 && (
          <section>
            <h2 style={{
              fontFamily: "'Lexend', sans-serif",
              fontSize: 22, fontWeight: 700, color: T.brandText, marginBottom: 20,
            }}>
              {bundles.length > 0 ? 'Individual Books' : 'Books'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
              {products.map((p, i) => (
                <ProductCard key={p.id} product={p} idx={i} onAddToCart={addToCart} adding={adding} />
              ))}
            </div>
          </section>
        )}

        {!loading && products.length === 0 && bundles.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: T.muted }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: .3 }}>📚</div>
            <div style={{
              fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6,
              fontFamily: "'Lexend', sans-serif",
            }}>
              No books yet
            </div>
            <div style={{ fontSize: 13, fontFamily: "'Figtree', sans-serif" }}>Check back soon!</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: `1px solid ${T.border}`,
        padding: '24px',
        textAlign: 'center',
        color: T.muted,
        fontSize: 12,
        fontFamily: "'Figtree', sans-serif",
      }}>
        © {new Date().getFullYear()} Storykeeper · Made with ❤️ for little readers
      </div>
    </div>
  );
}

// ── Primitives ────────────────────────────────────────────────────────────────
const primaryBtn = {
  padding: '9px 18px', borderRadius: 24, border: 'none', cursor: 'pointer',
  fontWeight: 700, fontSize: 13,
  background: '#634D96', color: '#fff',
  whiteSpace: 'nowrap',
  fontFamily: "'Figtree', sans-serif",
  transition: 'background .15s',
};

const ghostBtn = {
  padding: '7px 14px', borderRadius: 7, border: `1px solid #E8E0F7`, cursor: 'pointer',
  fontWeight: 600, fontSize: 12,
  background: '#fff', color: '#634D96',
  position: 'relative',
  fontFamily: "'Figtree', sans-serif",
};
