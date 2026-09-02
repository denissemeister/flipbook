import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email,   setEmail]   = useState('');
  const [status,  setStatus]  = useState('idle'); // idle | loading | sent | error
  const [errMsg,  setErrMsg]  = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('loading');
    try {
      await api.post('/auth/forgot-password', { email });
      setStatus('sent');
    } catch (err) {
      setErrMsg(err.message);
      setStatus('error');
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif' }}>
      <div style={{ width: 380 }}>

        <div style={{ textAlign: 'center', marginBottom: 32, fontSize: 22, fontWeight: 800,
          letterSpacing: -.5, background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ◈ Flipbook
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 32, boxShadow: '0 24px 64px rgba(0,0,0,.4)' }}>

          {status === 'sent' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Check your inbox</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                We sent a reset link to <strong>{email}</strong>. It expires in 1 hour.
              </div>
              <button className="btn btn-ghost" style={{ marginTop: 24, width: '100%', justifyContent: 'center' }}
                onClick={() => navigate('/login')}>
                ← Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Forgot your password?</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
                Enter your admin email and we'll send you a reset link.
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600,
                    color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>
                    Email
                  </label>
                  <input
                    className="input"
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" required autoFocus
                  />
                </div>

                {status === 'error' && (
                  <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)',
                    borderRadius: 6, padding: '8px 12px', color: 'var(--red)', fontSize: 12, marginBottom: 16 }}>
                    {errMsg}
                  </div>
                )}

                <button className="btn btn-primary" type="submit" disabled={status === 'loading'}
                  style={{ width: '100%', justifyContent: 'center', padding: '10px 0' }}>
                  {status === 'loading' ? 'Sending…' : 'Send reset link →'}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13 }}>
                <span onClick={() => navigate('/login')}
                  style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>
                  ← Back to sign in
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
