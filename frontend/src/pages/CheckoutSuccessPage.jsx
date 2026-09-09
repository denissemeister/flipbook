import { useNavigate } from 'react-router-dom';

const T = {
  bg:     '#f5f5f7',
  white:  '#ffffff',
  border: '#e5e7eb',
  text:   '#111827',
  muted:  '#6b7280',
  accent: '#6c63ff',
};

export default function CheckoutSuccessPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: T.bg,
      fontFamily: '-apple-system,BlinkMacSystemFont,"Inter",sans-serif',
      display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <div style={{ background: T.white, borderBottom: `1px solid ${T.border}`,
        height: 56, display: 'flex', alignItems: 'center', padding: '0 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -.3, cursor: 'pointer',
          background: 'linear-gradient(135deg,#6c63ff,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          onClick={() => navigate('/store')}>
          ◈ Flipbook
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 20,
          padding: '48px 40px', maxWidth: 480, width: '100%', textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>

          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>

          <h1 style={{ fontSize: 24, fontWeight: 800, color: T.text, margin: '0 0 12px' }}>
            Order Confirmed!
          </h1>

          <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.6, margin: '0 0 32px' }}>
            Thank you for your purchase. You'll receive a confirmation email shortly.
            Head to your orders to start personalizing your books!
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => navigate('/account/orders')}
              style={{ padding: '12px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 14, background: T.accent, color: '#fff',
                boxShadow: '0 2px 8px rgba(108,99,255,.3)' }}>
              View My Orders
            </button>
            <button onClick={() => navigate('/store')}
              style={{ padding: '12px 24px', borderRadius: 10, cursor: 'pointer',
                fontWeight: 600, fontSize: 14, background: T.white, color: T.muted,
                border: `1px solid ${T.border}` }}>
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
