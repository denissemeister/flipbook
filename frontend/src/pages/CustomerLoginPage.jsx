import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { customerApi } from '../api/customerClient';
import { useCustomerStore } from '../stores/customerStore';

function useIsMobile(bp = 640) {
  const [m, setM] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < bp);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [bp]);
  return m;
}

const T = {
  bg: '#f5f5f7', white: '#ffffff', border: '#e5e7eb',
  text: '#111827', muted: '#6b7280', accent: '#6c63ff',
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom:16 }}>
      <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.muted,
        textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ type = 'text', value, onChange, placeholder, autoFocus, required }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder}
      autoFocus={autoFocus} required={required}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ width:'100%', boxSizing:'border-box', padding:'12px 13px',
        border:`1.5px solid ${focused ? T.accent : T.border}`, borderRadius:8,
        fontSize:16, color:T.text, background:T.white, outline:'none',
        fontFamily:'inherit', transition:'border-color .15s' }}
    />
  );
}

export default function CustomerLoginPage() {
  const navigate = useNavigate();
  const { login } = useCustomerStore();
  const m = useIsMobile();
  const [mode,    setMode]    = useState('login');
  const [form,    setForm]    = useState({ email:'', password:'', first_name:'', last_name:'' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const body = mode === 'login'
        ? { email: form.email, password: form.password }
        : { email: form.email, password: form.password, first_name: form.first_name, last_name: form.last_name };
      const { accessToken, customer } = await customerApi.post(endpoint, body);
      login(accessToken, customer);
      navigate('/account/orders');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:T.bg, display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent: m ? 'flex-start' : 'center',
      padding: m ? '40px 16px 32px' : 24,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Inter",sans-serif' }}>

      {/* Logo */}
      <div style={{ fontSize: m ? 20 : 22, fontWeight:800, letterSpacing:-.5,
        marginBottom: m ? 20 : 28,
        background:'linear-gradient(135deg,#6c63ff,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
        ◈ Flipbook
      </div>

      <div style={{ width:'100%', maxWidth: m ? '100%' : 400, background:T.white,
        borderRadius: m ? 16 : 16,
        border:`1px solid ${T.border}`, padding: m ? '24px 20px' : 32,
        boxShadow:'0 4px 24px rgba(0,0,0,.08)' }}>

        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize: m ? 18 : 20, fontWeight:700, color:T.text, marginBottom:4 }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </div>
          <div style={{ fontSize:14, color:T.muted }}>
            {mode === 'login' ? 'Sign in to view your orders and personalize your books' : 'Join to access your purchased books'}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div style={{ display:'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap:12, marginBottom:0 }}>
              <Field label="First name">
                <Input value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Jane" />
              </Field>
              <Field label="Last name">
                <Input value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Smith" />
              </Field>
            </div>
          )}

          <Field label="Email">
            <Input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="you@example.com" autoFocus required />
          </Field>

          <Field label="Password">
            <Input type="password" value={form.password} onChange={e => set('password', e.target.value)}
              placeholder="••••••••" required />
          </Field>

          {error && (
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8,
              padding:'10px 13px', color:'#dc2626', fontSize:14, marginBottom:16 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{ width:'100%', padding: m ? '14px 0' : '11px 0', borderRadius:9, border:'none', cursor:'pointer',
              fontWeight:700, fontSize:16, background:T.accent, color:'#fff',
              boxShadow:'0 2px 10px rgba(108,99,255,.35)', opacity: loading ? .75 : 1,
              transition:'opacity .15s', fontFamily:'inherit',
              WebkitTapHighlightColor:'transparent' }}>
            {loading
              ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
              : (mode === 'login' ? 'Sign in →' : 'Create account →')}
          </button>
        </form>

        <div style={{ textAlign:'center', marginTop:20, fontSize:15, color:T.muted }}>
          {mode === 'login' ? (
            <>Don't have an account?{' '}
              <span onClick={() => { setMode('register'); setError(''); }}
                style={{ color:T.accent, cursor:'pointer', fontWeight:600 }}>Sign up</span>
            </>
          ) : (
            <>Already have an account?{' '}
              <span onClick={() => { setMode('login'); setError(''); }}
                style={{ color:T.accent, cursor:'pointer', fontWeight:600 }}>Sign in</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
