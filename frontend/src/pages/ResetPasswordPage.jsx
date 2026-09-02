import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [status,   setStatus]   = useState('idle'); // idle | loading | done | error
  const [errMsg,   setErrMsg]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setErrMsg('Passwords do not match'); setStatus('error'); return; }
    if (password.length < 8)  { setErrMsg('Password must be at least 8 characters'); setStatus('error'); return; }
    setStatus('loading'); setErrMsg('');
    try {
      await api.post('/auth/reset-password', { token, password });
      setStatus('done');
    } catch (err) {
      setErrMsg(err.message);
      setStatus('error');
    }
  }

  if (!token) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          Invalid reset link.{' '}
          <span onClick={() => navigate('/forgot-password')} style={{ color: 'var(--accent)', cursor: 'pointer' }}>
            Request a new one
          </span>
        </div>
      </div>
    );
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

          {status === 'done' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Password updated</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
                You can now sign in with your new password.
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px 0' }}
                onClick={() => navigate('/login')}>
                Sign in →
              </button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Set new password</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
                Choose a new password for your admin account.
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600,
                    color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>
                    New password
                  </label>
                  <input className="input" type="password" value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters" required autoFocus />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600,
                    color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>
                    Confirm new password
                  </label>
                  <input className="input" type="password" value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat new password" required />
                </div>

                {status === 'error' && (
                  <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)',
                    borderRadius: 6, padding: '8px 12px', color: 'var(--red)', fontSize: 12, marginBottom: 16 }}>
                    {errMsg}
                  </div>
                )}

                <button className="btn btn-primary" type="submit" disabled={status === 'loading'}
                  style={{ width: '100%', justifyContent: 'center', padding: '10px 0' }}>
                  {status === 'loading' ? 'Saving…' : 'Set new password →'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
