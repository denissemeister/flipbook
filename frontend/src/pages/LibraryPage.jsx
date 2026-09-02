import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { PAGE_FORMATS } from './EditorPage';

const STATUS_COLORS = {
  draft:     { bg: 'rgba(245,158,11,.15)', color: '#f59e0b', label: 'Draft' },
  published: { bg: 'rgba(34,197,94,.15)',  color: '#22c55e', label: 'Published' },
  archived:  { bg: 'rgba(136,145,170,.15)',color: '#8891aa', label: 'Archived' },
};

export default function LibraryPage() {
  const navigate          = useNavigate();
  const { admin, logout } = useAuthStore();
  const [books, setBooks] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast]         = useState('');

  // Create-book form state
  const [newTitle, setNewTitle]   = useState('');
  const [newOrient, setNewOrient] = useState('landscape-4-3');
  const [newPages, setNewPages]   = useState(1);
  const [creating, setCreating]   = useState(false);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2400);
  }

  const loadBooks = useCallback(async () => {
    try {
      const data = await api.get('/books');
      setBooks(data);
    } catch (err) {
      showToast('Failed to load books: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBooks(); }, [loadBooks]);

  async function createBook() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const book = await api.post('/books', {
        title: newTitle.trim(),
        orientation: newOrient,
      });
      // Add the requested number of pages
      const pageCount = Math.min(100, Math.max(1, newPages));
      for (let i = 0; i < pageCount; i++) {
        await api.post(`/books/${book.id}/pages`, {});
      }
      setShowCreate(false);
      setNewTitle(''); setNewOrient('landscape-4-3'); setNewPages(1);
      await loadBooks();
      navigate(`/admin/books/${book.id}/edit`);
    } catch (err) {
      showToast('Failed to create book: ' + err.message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteBook(book) {
    if (!confirm(`Delete "${book.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/books/${book.id}`);
      setBooks(prev => prev.filter(b => b.id !== book.id));
      showToast('Book deleted');
    } catch (err) {
      showToast(err.message);
    }
  }

  async function duplicateBook(book) {
    try {
      await api.post(`/books/${book.id}/duplicate`, {});
      await loadBooks();
      showToast(`"${book.title}" duplicated`);
    } catch (err) {
      showToast(err.message);
    }
  }

  async function archiveBook(book) {
    try {
      const updated = await api.post(`/books/${book.id}/archive`, {});
      setBooks(prev => prev.map(b => b.id === book.id ? updated : b));
      showToast('Book archived');
    } catch (err) {
      showToast(err.message);
    }
  }

  async function handleLogout() {
    try { await api.post('/auth/logout', {}); } catch {}
    logout();
    navigate('/login');
  }

  const filtered = filter === 'all' ? books : books.filter(b => b.status === filter);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Top bar */}
      <div style={{
        height: 56, background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16, flexShrink: 0,
      }}>
        <div style={{
          fontSize: 16, fontWeight: 800, letterSpacing: -.5,
          background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          ◈ Flipbook
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{admin?.email}</span>
        <button className="btn btn-ghost" onClick={() => navigate('/admin/settings')} style={{ fontSize: 11 }}>⚙ Settings</button>
        <button className="btn btn-ghost" onClick={handleLogout} style={{ fontSize: 11 }}>Sign out</button>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Book</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 32 }}>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {['all','draft','published','archived'].map(f => (
            <button
              key={f}
              className="btn btn-ghost"
              onClick={() => setFilter(f)}
              style={{
                fontSize: 11, padding: '5px 14px', textTransform: 'capitalize',
                background: filter === f ? 'var(--accent)' : undefined,
                color: filter === f ? '#fff' : undefined,
                borderColor: filter === f ? 'var(--accent)' : undefined,
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading books…</div>
        ) : filtered.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: 320, gap: 16, color: 'var(--muted)',
          }}>
            <div style={{ fontSize: 48, opacity: .2 }}>◈</div>
            <div style={{ fontSize: 14 }}>
              {filter === 'all' ? 'No books yet' : `No ${filter} books`}
            </div>
            {filter === 'all' && (
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                Create your first book →
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 16,
          }}>
            {filtered.map(book => (
              <BookCard
                key={book.id}
                book={book}
                onEdit={() => navigate(`/admin/books/${book.id}/edit`)}
                onDelete={() => deleteBook(book)}
                onDuplicate={() => duplicateBook(book)}
                onArchive={() => archiveBook(book)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create book modal */}
      {showCreate && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="modal">
            <div className="modal-title">Create New Book</div>
            <div className="modal-sub">Set up your book before adding pages.</div>

            <div className="modal-field">
              <label className="modal-label">Title</label>
              <input
                className="input"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Product Catalog Spring 2025"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && createBook()}
              />
            </div>

            <div className="modal-field">
              <label className="modal-label">Page Format</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {Object.entries(PAGE_FORMATS).map(([key, f]) => {
                  const active = newOrient === key;
                  const isLandscape = f.w > f.h;
                  return (
                    <div
                      key={key}
                      onClick={() => setNewOrient(key)}
                      style={{
                        border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        background: active ? 'var(--accent-glow)' : 'transparent',
                        borderRadius: 8, padding: '12px 10px', cursor: 'pointer', textAlign: 'center',
                        transition: 'all .12s',
                      }}
                    >
                      {/* Mini aspect-ratio preview */}
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                        <div style={{
                          width: isLandscape ? 36 : 24,
                          height: isLandscape ? Math.round(36 * f.h / f.w) : 36,
                          background: active ? 'var(--accent)' : 'var(--surface3)',
                          borderRadius: 2, opacity: active ? 1 : 0.6,
                          transition: 'background .12s',
                        }} />
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text)' }}>{f.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{f.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="modal-field">
              <label className="modal-label">Number of pages</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  className="input"
                  type="number" min={1} max={100}
                  value={newPages}
                  onChange={e => setNewPages(parseInt(e.target.value) || 1)}
                  style={{ width: 80 }}
                />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>1 – 100. You can add or remove pages later.</span>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createBook} disabled={creating || !newTitle.trim()}>
                {creating ? 'Creating…' : 'Create Book →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}

function BookCard({ book, onEdit, onDelete, onDuplicate, onArchive }) {
  const s = STATUS_COLORS[book.status] || STATUS_COLORS.draft;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
        transition: 'border-color .15s, transform .15s',
        position: 'relative',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      onClick={onEdit}
    >
      {/* Cover */}
      <div style={{
        height: 130,
        background: `linear-gradient(135deg, #1e1b4b, #312e81)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 32, color: 'rgba(255,255,255,.15)',
      }}>
        ◈
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {book.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: s.bg, color: s.color, textTransform: 'capitalize',
            }}>{s.label}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{book.page_count || 0}p</span>
          </div>

          {/* Actions menu */}
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              className="btn btn-ghost"
              style={{ padding: '2px 8px', fontSize: 14 }}
              onClick={() => setMenuOpen(v => !v)}
            >⋯</button>
            {menuOpen && (
              <div style={{
                position: 'absolute', right: 0, bottom: '100%', marginBottom: 4,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: 4, minWidth: 140, zIndex: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,.4)',
              }}
                onMouseLeave={() => setMenuOpen(false)}
              >
                <MenuItem label="✏️ Edit" onClick={() => { setMenuOpen(false); onEdit(); }} />
                <MenuItem label="⎘ Duplicate" onClick={() => { setMenuOpen(false); onDuplicate(); }} />
                {book.status === 'published' && (
                  <MenuItem label="📦 Archive" onClick={() => { setMenuOpen(false); onArchive(); }} />
                )}
                {book.status === 'draft' && (
                  <MenuItem label="🗑 Delete" onClick={() => { setMenuOpen(false); onDelete(); }} danger />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuItem({ label, onClick, danger }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '7px 12px', borderRadius: 5, cursor: 'pointer',
        fontSize: 12, color: danger ? 'var(--red)' : 'var(--text)',
        transition: 'background .1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {label}
    </div>
  );
}
