import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { accessToken, admin } = await api.post('/auth/login', { email, password });
      login(accessToken, admin);
      navigate('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg)',
    }}>
      <div style={{ width: 380 }}>
        {/* Logo */}
        <div style={{
          textAlign: 'center', marginBottom: 32,
          fontSize: 22, fontWeight: 800, letterSpacing: -.5,
          background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          ◈ Flipbook
        </div>

        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 32,
          boxShadow: '0 24px 64px rgba(0,0,0,.4)',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Welcome back</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 24 }}>
            Sign in to your admin account
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label className="modal-label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <label className="modal-label" style={{ margin: 0 }}>Password</label>
                <span onClick={() => navigate('/forgot-password')}
                  style={{ fontSize: 11, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>
                  Forgot password?
                </span>
              </div>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)',
                borderRadius: 6, padding: '8px 12px',
                color: 'var(--red)', fontSize: 12, marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', padding: '10px 0' }}
            >
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
