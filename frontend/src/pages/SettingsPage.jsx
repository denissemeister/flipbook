import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ type = 'text', value, onChange, placeholder, autoFocus }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ width: '100%', boxSizing: 'border-box', padding: '10px 13px',
        border: `1.5px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--surface2)',
        outline: 'none', fontFamily: 'inherit', transition: 'border-color .15s' }}
    />
  );
}

function Card({ title, desc, children, result }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: 28, marginBottom: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>{desc}</div>
      {children}
      {result && (
        <div style={{
          marginTop: 14, padding: '10px 13px', borderRadius: 8, fontSize: 13,
          background: result.ok ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
          border: `1px solid ${result.ok ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
          color: result.ok ? 'var(--green)' : 'var(--red)',
        }}>
          {result.msg}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { admin, login } = useAuthStore();

  const [emailForm, setEmailForm] = useState({ currentPassword: '', newEmail: '' });
  const [emailResult, setEmailResult] = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);

  const [passForm, setPassForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passResult, setPassResult] = useState(null);
  const [passLoading, setPassLoading] = useState(false);

  function setEF(k, v) { setEmailForm(f => ({ ...f, [k]: v })); }
  function setPF(k, v) { setPassForm(f => ({ ...f, [k]: v })); }

  async function handleEmailChange(e) {
    e.preventDefault();
    if (!emailForm.newEmail) return;
    setEmailLoading(true); setEmailResult(null);
    try {
      const res = await api.patch('/auth/me', {
        currentPassword: emailForm.currentPassword,
        newEmail: emailForm.newEmail,
      });
      setEmailResult({ ok: true, msg: `Email updated to ${res.email}` });
      setEmailForm({ currentPassword: '', newEmail: '' });
    } catch (err) {
      setEmailResult({ ok: false, msg: err.message });
    } finally {
      setEmailLoading(false);
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    if (passForm.newPassword !== passForm.confirm) {
      setPassResult({ ok: false, msg: 'New passwords do not match' });
      return;
    }
    setPassLoading(true); setPassResult(null);
    try {
      await api.patch('/auth/me', {
        currentPassword: passForm.currentPassword,
        newPassword: passForm.newPassword,
      });
      setPassResult({ ok: true, msg: 'Password updated successfully' });
      setPassForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPassResult({ ok: false, msg: err.message });
    } finally {
      setPassLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif' }}>

      {/* Top bar */}
      <div style={{ height: 52, background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12 }}>
        <div
          style={{ fontSize: 15, fontWeight: 800, letterSpacing: -.5, cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          onClick={() => navigate('/admin')}
        >◈</div>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Settings</span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => navigate('/admin')}>
          ← Back to Library
        </button>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 520, margin: '40px auto', padding: '0 20px' }}>

        {/* Current account info */}
        <div style={{ marginBottom: 28, padding: '14px 18px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 10,
          fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {(admin?.email?.[0] || 'A').toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>{admin?.email}</div>
            <div style={{ fontSize: 11 }}>Admin account</div>
          </div>
        </div>

        {/* Change email */}
        <Card
          title="Change Email"
          desc="Update the email address you use to sign in."
          result={emailResult}
        >
          <form onSubmit={handleEmailChange}>
            <Field label="Current password">
              <Input type="password" value={emailForm.currentPassword}
                onChange={e => setEF('currentPassword', e.target.value)}
                placeholder="Enter current password" autoFocus />
            </Field>
            <Field label="New email">
              <Input type="email" value={emailForm.newEmail}
                onChange={e => setEF('newEmail', e.target.value)}
                placeholder="new@example.com" />
            </Field>
            <button type="submit" disabled={emailLoading || !emailForm.currentPassword || !emailForm.newEmail}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 13, background: 'var(--accent)', color: '#fff',
                opacity: emailLoading || !emailForm.currentPassword || !emailForm.newEmail ? .5 : 1,
                fontFamily: 'inherit' }}>
              {emailLoading ? 'Saving…' : 'Update email'}
            </button>
          </form>
        </Card>

        {/* Change password */}
        <Card
          title="Change Password"
          desc="Choose a new password. Must be at least 8 characters."
          result={passResult}
        >
          <form onSubmit={handlePasswordChange}>
            <Field label="Current password">
              <Input type="password" value={passForm.currentPassword}
                onChange={e => setPF('currentPassword', e.target.value)}
                placeholder="Enter current password" />
            </Field>
            <Field label="New password">
              <Input type="password" value={passForm.newPassword}
                onChange={e => setPF('newPassword', e.target.value)}
                placeholder="At least 8 characters" />
            </Field>
            <Field label="Confirm new password">
              <Input type="password" value={passForm.confirm}
                onChange={e => setPF('confirm', e.target.value)}
                placeholder="Repeat new password" />
            </Field>
            <button type="submit"
              disabled={passLoading || !passForm.currentPassword || !passForm.newPassword || !passForm.confirm}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 13, background: 'var(--accent)', color: '#fff',
                opacity: passLoading || !passForm.currentPassword || !passForm.newPassword || !passForm.confirm ? .5 : 1,
                fontFamily: 'inherit' }}>
              {passLoading ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </Card>

        {/* Forgot password note */}
        <div style={{ padding: '16px 18px', background: 'rgba(108,99,255,.06)',
          border: '1px solid rgba(108,99,255,.15)', borderRadius: 10,
          fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            🔑 Forgot your password?
          </div>
          If you're locked out, run this command in your terminal to reset it:
          <pre style={{ marginTop: 10, padding: '10px 14px', background: 'var(--surface2)',
            borderRadius: 7, fontSize: 12, overflowX: 'auto', color: 'var(--text)',
            border: '1px solid var(--border)', lineHeight: 1.6 }}>
{`node reset-password.js your@email.com newpassword`}
          </pre>
          <div style={{ marginTop: 8, fontSize: 12 }}>
            Run from the <code style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>backend</code> folder.
          </div>
        </div>
      </div>
    </div>
  );
}
