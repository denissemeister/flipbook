import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function useIsMobile(bp = 640) {
  const [m, setM] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < bp);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [bp]);
  return m;
}
import { customerApi } from '../api/customerClient';
import { useCustomerStore } from '../stores/customerStore';

// ── Light theme tokens ────────────────────────────────────────────────────────
const T = {
  bg:       '#f5f5f7',
  white:    '#ffffff',
  border:   '#e5e7eb',
  text:     '#111827',
  muted:    '#6b7280',
  accent:   '#6c63ff',
  accentBg: 'rgba(108,99,255,.08)',
};

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  pending:      { label: 'Not personalized', color: '#d97706', bg: '#fef3c7' },
  personalized: { label: 'Personalized',     color: '#6c63ff', bg: '#ede9fe' },
  shared:       { label: 'Shared',           color: '#059669', bg: '#d1fae5' },
  reviewed:     { label: 'Reviewed',         color: '#9ca3af', bg: '#f3f4f6' },
};

const CTA = {
  pending:      { label: 'Personalize', style: 'primary' },
  personalized: { label: 'Share',       style: 'share'   },
  shared:       { label: 'Write a Review', style: 'review' },
  reviewed:     null,
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
}

function formatPrice(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style:'currency', currency }).format(amount);
}

// ── Share popup ───────────────────────────────────────────────────────────────
function SharePopup({ item, onClose, onShared }) {
  const bookUrl = `${window.location.origin}/view/${item.book_slug}`;

  function shareVia(channel) {
    const msg = `Check out my personalized book: ${item.book_title}`;
    const urls = {
      email:     `mailto:?subject=${encodeURIComponent(item.book_title)}&body=${encodeURIComponent(msg + '\n' + bookUrl)}`,
      sms:       `sms:?body=${encodeURIComponent(msg + ' ' + bookUrl)}`,
      whatsapp:  `https://wa.me/?text=${encodeURIComponent(msg + ' ' + bookUrl)}`,
      instagram: null,
    };
    if (channel === 'instagram') {
      navigator.clipboard.writeText(bookUrl).then(() => alert('Link copied! Paste it in your Instagram DM.'));
    } else if (urls[channel]) {
      window.open(urls[channel], '_blank');
    }
    customerApi.patch(`/order-items/${item.id}/advance`, {})
      .then(updated => { onShared(updated); onClose(); })
      .catch(() => onClose());
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize:18, fontWeight:700, color:T.text, marginBottom:4 }}>Share your book</div>
      <div style={{ fontSize:13, color:T.muted, marginBottom:24 }}>Choose how to share <strong style={{ color:T.text }}>{item.book_title}</strong></div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
        {[
          { channel:'email',     icon:'✉️', label:'Email' },
          { channel:'sms',       icon:'💬', label:'Text Message' },
          { channel:'whatsapp',  icon:'🟢', label:'WhatsApp' },
          { channel:'instagram', icon:'📷', label:'Instagram DM' },
        ].map(({ channel, icon, label }) => (
          <button key={channel} onClick={() => shareVia(channel)}
            style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'16px 12px',
              background:T.white, border:`1px solid ${T.border}`, borderRadius:10, cursor:'pointer',
              color:T.text, fontSize:13, fontWeight:600, transition:'border-color .12s, box-shadow .12s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${T.accentBg}`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <span style={{ fontSize:24 }}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
        <span style={{ flex:1, fontSize:12, color:T.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{bookUrl}</span>
        <button onClick={() => navigator.clipboard.writeText(bookUrl)}
          style={{ fontSize:11, fontWeight:600, color:T.accent, background:'none', border:'none', cursor:'pointer', flexShrink:0 }}>
          Copy
        </button>
      </div>

      <button onClick={onClose} style={ghostBtn}>Cancel</button>
    </Overlay>
  );
}

// ── Review popup ──────────────────────────────────────────────────────────────
function ReviewPopup({ item, onClose, onReviewed }) {
  const [rating, setRating] = useState(0);
  const [hover,  setHover]  = useState(0);
  const [text,   setText]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function submit() {
    if (!rating) { setError('Please select a star rating'); return; }
    setLoading(true);
    try {
      const updated = await customerApi.patch(`/order-items/${item.id}/advance`, { review_rating: rating, review_text: text });
      onReviewed(updated); onClose();
    } catch (err) { setError(err.message); setLoading(false); }
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize:18, fontWeight:700, color:T.text, marginBottom:4 }}>Write a Review</div>
      <div style={{ fontSize:13, color:T.muted, marginBottom:24 }}>Share your experience with <strong style={{ color:T.text }}>{item.book_title}</strong></div>

      <div style={{ display:'flex', gap:6, marginBottom:20 }}>
        {[1,2,3,4,5].map(n => (
          <span key={n}
            style={{ fontSize:36, cursor:'pointer', color: n <= (hover||rating) ? '#f59e0b' : '#d1d5db', transition:'color .1s', userSelect:'none' }}
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setRating(n)}
          >★</span>
        ))}
      </div>

      <div style={{ marginBottom:16 }}>
        <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>
          Your review (optional)
        </label>
        <textarea
          rows={4} value={text} onChange={e => setText(e.target.value)}
          placeholder="What did you love about this book?"
          style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', border:`1px solid ${T.border}`, borderRadius:8,
            fontSize:13, color:T.text, background:T.white, resize:'vertical', outline:'none', fontFamily:'inherit' }}
          onFocus={e => e.target.style.borderColor = T.accent}
          onBlur={e => e.target.style.borderColor = T.border}
        />
      </div>

      {error && <div style={{ color:'#dc2626', fontSize:12, marginBottom:12 }}>{error}</div>}

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onClose} style={{ ...ghostBtn, flex:1 }}>Cancel</button>
        <button onClick={submit} disabled={loading}
          style={{ ...primaryBtn, flex:1, opacity: loading ? .7 : 1 }}>
          {loading ? 'Submitting…' : 'Submit Review'}
        </button>
      </div>
    </Overlay>
  );
}

// ── Order item row ─────────────────────────────────────────────────────────────
function OrderItem({ item, onUpdate }) {
  const m = useIsMobile();
  const [shareOpen,  setShareOpen]  = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const navigate = useNavigate();
  const cta = CTA[item.book_status];
  const statusCfg = STATUS[item.book_status];

  function handleCta() {
    if (item.book_status === 'pending')      return navigate(`/personalize/${item.id}/${item.book_slug}`);
    if (item.book_status === 'personalized') return setShareOpen(true);
    if (item.book_status === 'shared')       return setReviewOpen(true);
  }

  const ctaStyle = cta ? {
    flexShrink: 0, borderRadius: 8, border: 'none', cursor: 'pointer',
    fontWeight: 700, fontSize: 13, transition: 'opacity .15s',
    padding: m ? '12px 0' : '8px 18px',
    width: m ? '100%' : 'auto',
    minHeight: m ? 46 : 'auto',
    ...(cta.style === 'primary'
      ? { background: T.accent, color: '#fff', boxShadow: `0 2px 8px rgba(108,99,255,.3)` }
      : cta.style === 'share'
      ? { background: T.accentBg, color: T.accent, border: `1.5px solid ${T.accent}` }
      : { background: '#fef9c3', color: '#b45309', border: '1.5px solid #fde68a' }),
  } : null;

  return (
    <>
      <div style={{ padding: '16px 0', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Book cover */}
          <div style={{ width: 48, height: 64, borderRadius: 6, flexShrink: 0,
            background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, color: 'rgba(255,255,255,.3)', boxShadow: '0 2px 8px rgba(0,0,0,.12)' }}>◈</div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: T.text, marginBottom: 5,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.book_title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                background: statusCfg.bg, color: statusCfg.color }}>
                {statusCfg.label}
              </span>
              {item.review_rating && (
                <span style={{ fontSize: 12, color: '#f59e0b' }}>{'★'.repeat(item.review_rating)}</span>
              )}
            </div>
          </div>

          {/* Price — hidden on mobile (shown below) */}
          {!m && (
            <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, flexShrink: 0 }}>
              {formatPrice(item.unit_price)}
            </div>
          )}

          {/* CTA inline on desktop */}
          {cta && !m && (
            <button onClick={handleCta} style={ctaStyle}
              onMouseEnter={e => e.currentTarget.style.opacity = '.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >{cta.label}</button>
          )}
        </div>

        {/* Mobile: price + full-width CTA below */}
        {m && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>
              {formatPrice(item.unit_price)}
            </span>
            {cta && (
              <button onClick={handleCta} style={{ ...ctaStyle, flex: 1, marginLeft: 'auto' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >{cta.label}</button>
            )}
          </div>
        )}
      </div>

      {shareOpen  && <SharePopup  item={item} onClose={() => setShareOpen(false)}  onShared={u => onUpdate(u)} />}
      {reviewOpen && <ReviewPopup item={item} onClose={() => setReviewOpen(false)} onReviewed={u => onUpdate(u)} />}
    </>
  );
}

// ── Order card ────────────────────────────────────────────────────────────────
function OrderCard({ order, onItemUpdate }) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ background:T.white, border:`1px solid ${T.border}`, borderRadius:14,
      overflow:'hidden', marginBottom:16, boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:16, padding:'16px 20px',
        cursor:'pointer', borderBottom: open ? `1px solid ${T.border}` : 'none' }}
        onClick={() => setOpen(v => !v)}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:3 }}>
            <span style={{ fontWeight:700, fontSize:14, color:T.text }}>Order #{order.order_number}</span>
            <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:20,
              background:'#dcfce7', color:'#15803d', textTransform:'capitalize' }}>
              {order.status}
            </span>
          </div>
          <div style={{ fontSize:12, color:T.muted }}>
            {formatDate(order.placed_at)} · {order.items.length} book{order.items.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div style={{ textAlign:'right' }}>
          <div style={{ fontWeight:700, fontSize:16, color:T.text }}>{formatPrice(order.total, order.currency)}</div>
          {order.invoice_url && (
            <a href={order.invoice_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              style={{ fontSize:11, color:T.accent, textDecoration:'none', fontWeight:600 }}>
              Invoice ↗
            </a>
          )}
        </div>

        <span style={{ color:T.muted, fontSize:13 }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Items */}
      {open && (
        <div style={{ padding:'0 20px' }}>
          {order.items.map(item => (
            <OrderItem key={item.id} item={item} onUpdate={updated => onItemUpdate(order.id, updated)} />
          ))}
          {!order.items.length && (
            <div style={{ padding:'20px 0', color:T.muted, fontSize:13 }}>No books in this order.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const m = useIsMobile();
  const navigate = useNavigate();
  const { customer, logout } = useCustomerStore();
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    customerApi.get('/orders')
      .then(data => setOrders(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    customerApi.post('/auth/logout', {}).catch(() => {});
    logout();
    navigate('/account/login');
  }

  function handleItemUpdate(orderId, updatedItem) {
    setOrders(prev => prev.map(o => o.id !== orderId ? o : {
      ...o, items: o.items.map(i => i.id === updatedItem.id ? { ...i, ...updatedItem } : i),
    }));
  }

  return (
    <div style={{ minHeight:'100vh', background:T.bg, fontFamily:'-apple-system,BlinkMacSystemFont,"Inter",sans-serif' }}>

      {/* Nav */}
      <div style={{ background:T.white, borderBottom:`1px solid ${T.border}`,
        padding: m ? '0 16px' : '0 24px',
        height:56, display:'flex', alignItems:'center', gap:12,
        boxShadow:'0 1px 3px rgba(0,0,0,.06)', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ fontSize:15, fontWeight:800, letterSpacing:-.3,
          background:'linear-gradient(135deg,#6c63ff,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          ◈ Flipbook
        </div>
        <div style={{ flex:1 }} />
        {!m && (
          <span style={{ fontSize:12, color:T.muted, fontWeight:500 }}>
            {customer?.first_name ? `Hi, ${customer.first_name} 👋` : customer?.email}
          </span>
        )}
        <button onClick={handleLogout}
          style={{ fontSize:12, fontWeight:600, color:T.muted, background:'none', border:`1px solid ${T.border}`,
            borderRadius:7, padding:'6px 14px', cursor:'pointer', minHeight:36 }}
          onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
          onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
        >Sign out</button>
      </div>

      {/* Content */}
      <div style={{ maxWidth:720, margin:'0 auto', padding: m ? '24px 16px' : '40px 24px' }}>
        <div style={{ marginBottom: m ? 20 : 32 }}>
          <h1 style={{ fontSize: m ? 20 : 24, fontWeight:800, color:T.text, margin:0, marginBottom:6 }}>Your Orders</h1>
          {!m && <p style={{ fontSize:14, color:T.muted, margin:0 }}>Personalize, share, and review the books you've purchased.</p>}
        </div>

        {loading && (
          <div style={{ color:T.muted, fontSize:13 }}>Loading your orders…</div>
        )}

        {error && (
          <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10,
            padding:'12px 16px', color:'#dc2626', fontSize:13 }}>
            {error}
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div style={{ textAlign:'center', padding:'80px 0', color:T.muted }}>
            <div style={{ fontSize:48, marginBottom:16, opacity:.3 }}>📦</div>
            <div style={{ fontSize:15, fontWeight:600, color:T.text, marginBottom:6 }}>No orders yet</div>
            <div style={{ fontSize:13 }}>When you purchase a book, it will appear here.</div>
          </div>
        )}

        {orders.map(order => (
          <OrderCard key={order.id} order={order} onItemUpdate={handleItemUpdate} />
        ))}
      </div>
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────
function Overlay({ children, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', backdropFilter:'blur(4px)',
      zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:T.white, borderRadius:16, padding:32, width:'100%', maxWidth:420,
        boxShadow:'0 24px 64px rgba(0,0,0,.15)' }}>
        {children}
      </div>
    </div>
  );
}

const primaryBtn = {
  padding:'10px 20px', borderRadius:8, border:'none', cursor:'pointer',
  fontWeight:600, fontSize:13, background:'#6c63ff', color:'#fff',
  display:'flex', alignItems:'center', justifyContent:'center',
};

const ghostBtn = {
  padding:'10px 20px', borderRadius:8, border:'1px solid #e5e7eb', cursor:'pointer',
  fontWeight:600, fontSize:13, background:'#fff', color:'#374151',
  display:'flex', alignItems:'center', justifyContent:'center',
};
