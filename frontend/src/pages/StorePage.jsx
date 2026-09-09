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

// ── Nav bar ───────────────────────────────────────────────────────────────────
function Nav({ cartCount }) {
  const navigate   = useNavigate();
  const { customer, logout } = useCustomerStore();

  function handleLogout() {
    storeApi.post('/cart', {}).catch(() => {});
    logout();
    navigate('/store');
  }

  return (
    <div style={{ background: T.white, borderBottom: `1px solid ${T.border}`,
      height: 56, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,.06)', position: 'sticky', top: 0, zIndex: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -.3, cursor: 'pointer',
        background: 'linear-gradient(135deg,#6c63ff,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        onClick={() => navigate('/store')}>
        ◈ Flipbook
      </div>
      <div style={{ flex: 1 }} />
      {customer ? (
        <>
          <span style={{ fontSize: 12, color: T.muted }}>
            Hi, {customer.first_name || customer.email}
          </span>
          <button onClick={() => navigate('/account/orders')}
            style={ghostBtn}>My Orders</button>
          <button onClick={handleLogout}
            style={ghostBtn}>Sign out</button>
        </>
      ) : (
        <button onClick={() => navigate('/account/login')}
          style={ghostBtn}>Sign in</button>
      )}
      <button onClick={() => navigate('/store/cart')}
        style={{ ...ghostBtn, position: 'relative' }}>
        🛒 Cart
        {cartCount > 0 && (
          <span style={{ position: 'absolute', top: -6, right: -6, background: T.accent,
            color: '#fff', borderRadius: '50%', width: 18, height: 18,
            fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {cartCount}
          </span>
        )}
      </button>
    </div>
  );
}

// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({ product, onAddToCart, adding }) {
  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14,
      overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      display: 'flex', flexDirection: 'column' }}>
      {/* Cover */}
      <div style={{ height: 180, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 48, color: 'rgba(255,255,255,.2)' }}>
        {product.cover_image
          ? <img src={product.cover_image} alt={product.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : '◈'}
      </div>
      {/* Info */}
      <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {product.book_title && (
          <div style={{ fontSize: 10, fontWeight: 600, color: T.accent, textTransform: 'uppercase', letterSpacing: .6 }}>
            {product.book_title}
          </div>
        )}
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{product.title}</div>
        {product.description && (
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, flex: 1 }}>{product.description}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{formatPrice(product.price)}</div>
          <button onClick={() => onAddToCart(product.id, 'product')}
            disabled={adding === product.id}
            style={{ ...primaryBtn, opacity: adding === product.id ? .7 : 1 }}>
            {adding === product.id ? 'Adding…' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bundle card ───────────────────────────────────────────────────────────────
function BundleCard({ bundle, onAddToCart, adding }) {
  return (
    <div style={{ background: T.white, border: `2px solid ${T.accent}`, borderRadius: 14,
      overflow: 'hidden', boxShadow: '0 2px 12px rgba(108,99,255,.12)',
      display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: T.accentBg, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.accent, textTransform: 'uppercase', letterSpacing: .8 }}>
          Bundle — Best Value
        </span>
      </div>
      <div style={{ height: 160, background: 'linear-gradient(135deg,#6c63ff,#a78bfa)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40,
        color: 'rgba(255,255,255,.25)' }}>
        {bundle.cover_image
          ? <img src={bundle.cover_image} alt={bundle.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : '◈◈'}
      </div>
      <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{bundle.title}</div>
        {bundle.description && (
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{bundle.description}</div>
        )}
        {bundle.products?.length > 0 && (
          <div style={{ fontSize: 11, color: T.muted }}>
            Includes: {bundle.products.map(p => p.title).join(', ')}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.accent }}>{formatPrice(bundle.price)}</div>
          <button onClick={() => onAddToCart(bundle.id, 'bundle')}
            disabled={adding === bundle.id}
            style={{ ...primaryBtn, opacity: adding === bundle.id ? .7 : 1 }}>
            {adding === bundle.id ? 'Adding…' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StorePage() {
  const navigate   = useNavigate();
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
    if (!customerToken) {
      navigate('/account/login');
      return;
    }
    setAdding(id);
    try {
      const cart = await storeApi.post('/cart', type === 'product' ? { product_id: id } : { bundle_id: id });
      setCartCount(cart.items?.length || 0);
      showToast('Added to cart!');
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
    <div style={{ minHeight: '100vh', background: T.bg,
      fontFamily: '-apple-system,BlinkMacSystemFont,"Inter",sans-serif' }}>

      <Nav cartCount={cartCount} />

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#111', color: '#fff', padding: '10px 20px', borderRadius: 10,
          fontSize: 13, fontWeight: 600, zIndex: 999, boxShadow: '0 4px 20px rgba(0,0,0,.3)' }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: T.text, margin: '0 0 8px' }}>
            Personalized Books for Every Child
          </h1>
          <p style={{ fontSize: 15, color: T.muted, margin: 0 }}>
            Choose a book, personalize it with your child's name and voice, and share a link they'll love forever.
          </p>
        </div>

        {/* Volume discount banner */}
        {discounts.length > 0 && (
          <div style={{ background: 'linear-gradient(135deg,#6c63ff,#a78bfa)',
            borderRadius: 12, padding: '16px 24px', marginBottom: 40,
            display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              🎉 Volume Discounts
            </span>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {discounts.map(d => (
                <span key={d.id} style={{ fontSize: 12, color: 'rgba(255,255,255,.85)',
                  background: 'rgba(255,255,255,.15)', borderRadius: 20, padding: '4px 12px', fontWeight: 600 }}>
                  {d.label || `${d.min_quantity}+ books`}: {d.discount_percent}% off
                </span>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: T.muted }}>Loading books…</div>
        )}

        {/* Bundles */}
        {!loading && bundles.length > 0 && (
          <section style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: T.text, marginBottom: 20 }}>Bundles</h2>
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
            <h2 style={{ fontSize: 20, fontWeight: 800, color: T.text, marginBottom: 20 }}>
              {bundles.length > 0 ? 'Individual Books' : 'Books'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
              {products.map(p => (
                <ProductCard key={p.id} product={p} onAddToCart={addToCart} adding={adding} />
              ))}
            </div>
          </section>
        )}

        {!loading && products.length === 0 && bundles.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: T.muted }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: .3 }}>📚</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6 }}>No books yet</div>
            <div style={{ fontSize: 13 }}>Check back soon!</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Primitives ────────────────────────────────────────────────────────────────
const primaryBtn = {
  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontWeight: 700, fontSize: 13, background: '#6c63ff', color: '#fff',
  whiteSpace: 'nowrap',
};

const ghostBtn = {
  padding: '6px 14px', borderRadius: 7, border: `1px solid #e5e7eb`, cursor: 'pointer',
  fontWeight: 600, fontSize: 12, background: '#fff', color: '#374151',
  position: 'relative',
};
