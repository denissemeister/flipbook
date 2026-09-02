import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function ReadAloudPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [book,    setBook]    = useState(null);
  const [pages,   setPages]   = useState([]);
  const [texts,   setTexts]   = useState({}); // { [pageId]: string }
  const [audios,  setAudios]  = useState({}); // { [pageId]: url|null }
  const [status,  setStatus]  = useState({}); // { [pageId]: 'saved'|'saving'|'unsaved' }
  const [uploading, setUploading] = useState({}); // { [pageId]: bool }
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState('');
  const timers = useRef({});

  function showToast(m) {
    setToast(m);
    setTimeout(() => setToast(''), 2400);
  }

  // Load book + pages
  useEffect(() => {
    api.get(`/books/${id}`)
      .then(data => {
        setBook(data);
        const pgs = data.pages || [];
        setPages(pgs);
        const initTexts = {}, initAudios = {}, initStatus = {};
        pgs.forEach(p => {
          initTexts[p.id]  = p.read_aloud_text  || '';
          initAudios[p.id] = p.read_aloud_audio  || null;
          initStatus[p.id] = 'saved';
        });
        setTexts(initTexts);
        setAudios(initAudios);
        setStatus(initStatus);
      })
      .catch(err => showToast('Failed to load: ' + err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Auto-save text after 800ms idle
  const savePageText = useCallback((pageId, text) => {
    setStatus(s => ({ ...s, [pageId]: 'saving' }));
    api.patch(`/books/${id}/pages/${pageId}/read-aloud`, { read_aloud_text: text })
      .then(() => setStatus(s => ({ ...s, [pageId]: 'saved' })))
      .catch(() => setStatus(s => ({ ...s, [pageId]: 'unsaved' })));
  }, [id]);

  function handleTextChange(pageId, value) {
    setTexts(t => ({ ...t, [pageId]: value }));
    setStatus(s => ({ ...s, [pageId]: 'unsaved' }));
    clearTimeout(timers.current[pageId]);
    timers.current[pageId] = setTimeout(() => savePageText(pageId, value), 800);
  }

  // Audio upload — uses the existing /media/upload endpoint, then saves the URL via PATCH
  async function handleAudioUpload(pageId, file) {
    if (!file) return;
    setUploading(u => ({ ...u, [pageId]: true }));
    try {
      // Step 1: upload the file to the media library
      const form = new FormData();
      form.append('file', file);
      const asset = await api.upload('/media/upload', form);
      // Step 2: save the returned URL to the page
      const updated = await api.patch(`/books/${id}/pages/${pageId}/read-aloud`, { read_aloud_audio: asset.url });
      setAudios(a => ({ ...a, [pageId]: updated.read_aloud_audio }));
      showToast('✓ Audio uploaded');
    } catch (err) {
      showToast('Upload failed: ' + err.message);
    } finally {
      setUploading(u => ({ ...u, [pageId]: false }));
    }
  }

  // Audio remove — clears the URL in the DB (file stays in media library)
  async function handleAudioRemove(pageId) {
    if (!confirm('Remove audio for this page?')) return;
    try {
      await api.patch(`/books/${id}/pages/${pageId}/read-aloud`, { read_aloud_audio: null });
      setAudios(a => ({ ...a, [pageId]: null }));
      showToast('Audio removed');
    } catch (err) {
      showToast('Failed to remove: ' + err.message);
    }
  }

  // Save all text at once
  async function saveAll() {
    const unsaved = pages.filter(p => status[p.id] !== 'saved');
    if (!unsaved.length) { showToast('All saved!'); return; }
    await Promise.all(unsaved.map(p => savePageText(p.id, texts[p.id] || '')));
    showToast('✓ All pages saved');
  }

  const pageLabel = (page) => page.page_number === 1 ? 'Cover' : `Page ${page.page_number}`;
  const allSaved  = pages.every(p => status[p.id] === 'saved');
  const readerUrl = book?.slug ? `/read/${book.slug}/aloud` : null;

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)', color:'var(--muted)' }}>
      Loading…
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column' }}>

      {/* ── Top bar ── */}
      <div style={{
        height: 52, background:'var(--surface)', borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center', padding:'0 20px', gap:12, flexShrink:0,
      }}>
        <div
          style={{ fontSize:15, fontWeight:800, letterSpacing:-.5, cursor:'pointer',
            background:'linear-gradient(135deg,var(--accent),#a78bfa)',
            WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}
          onClick={() => navigate('/admin')}
        >◈</div>
        <span style={{ color:'var(--muted)', fontSize:12 }}>›</span>
        <span
          style={{ fontSize:13, fontWeight:600, cursor:'pointer', color:'var(--muted)' }}
          onClick={() => navigate(`/admin/books/${id}/edit`)}
        >{book?.title || '…'}</span>
        <span style={{ color:'var(--muted)', fontSize:12 }}>›</span>
        <span style={{ fontSize:13, fontWeight:600 }}>Read Aloud Text</span>
        <div style={{ flex:1 }} />
        <span style={{ fontSize:11, color: allSaved ? 'var(--green)' : 'var(--amber)' }}>
          {allSaved ? '✓ All saved' : '● Unsaved changes'}
        </span>
        {readerUrl && (
          <button className="btn btn-ghost" style={{ fontSize:11 }}
            onClick={() => window.open(readerUrl, '_blank')}>
            ▶ Preview Reader
          </button>
        )}
        <button className="btn btn-ghost" style={{ fontSize:11 }}
          onClick={() => navigate(`/admin/books/${id}/edit`)}>
          ← Back to Editor
        </button>
        <button className="btn btn-primary" onClick={saveAll} style={{ fontSize:11 }}>
          Save All
        </button>
      </div>

      {/* ── Content ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'32px 24px', maxWidth:760, margin:'0 auto', width:'100%', boxSizing:'border-box' }}>

        <div style={{ marginBottom:28 }}>
          <h2 style={{ fontSize:18, fontWeight:800, margin:'0 0 6px' }}>Read Aloud Text</h2>
          <p style={{ fontSize:13, color:'var(--muted)', margin:0, lineHeight:1.6 }}>
            Enter the text and optionally upload audio for each page of{' '}
            <strong style={{ color:'var(--text)' }}>{book?.title}</strong>.
            Text is saved automatically as you type. Audio files are uploaded immediately.
          </p>
        </div>

        {pages.map((page, idx) => {
          const label    = pageLabel(page);
          const st       = status[page.id] || 'saved';
          const saveColor = { saved:'var(--green)', saving:'var(--amber)', unsaved:'var(--amber)' }[st];
          const saveLabel = { saved:'✓ Saved', saving:'Saving…', unsaved:'● Unsaved' }[st];
          const isEmpty  = !(texts[page.id] || '').trim();
          const audioUrl = audios[page.id];
          const isUploading = uploading[page.id];

          return (
            <div key={page.id} style={{
              background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:12, marginBottom:16, overflow:'hidden',
              boxShadow:'0 1px 4px rgba(0,0,0,.15)',
            }}>
              {/* Page header */}
              <div style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'12px 16px', borderBottom:'1px solid var(--border)',
                background:'var(--surface2)',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{
                    width:28, height:28, borderRadius:6,
                    background: idx === 0 ? 'linear-gradient(135deg,var(--accent),#a78bfa)' : 'var(--surface3)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:11, fontWeight:800, color: idx === 0 ? '#fff' : 'var(--muted)',
                    flexShrink:0,
                  }}>
                    {idx === 0 ? '★' : page.page_number}
                  </div>
                  <span style={{ fontWeight:700, fontSize:14 }}>{label}</span>
                  {isEmpty && (
                    <span style={{ fontSize:10, color:'var(--muted)', background:'var(--surface3)', padding:'2px 7px', borderRadius:4 }}>
                      No text yet
                    </span>
                  )}
                  {audioUrl && (
                    <span style={{ fontSize:10, color:'#38bdf8', background:'rgba(14,165,233,.12)', padding:'2px 7px', borderRadius:4 }}>
                      ♪ Audio
                    </span>
                  )}
                </div>
                <span style={{ fontSize:11, color: saveColor }}>{saveLabel}</span>
              </div>

              {/* Textarea */}
              <div style={{ padding:'16px 16px 0' }}>
                <textarea
                  value={texts[page.id] || ''}
                  onChange={e => handleTextChange(page.id, e.target.value)}
                  placeholder={idx === 0
                    ? 'Enter the cover text — e.g. the book title and subtitle as read aloud…'
                    : `Enter the text for page ${page.page_number}…`}
                  rows={5}
                  style={{
                    width:'100%', boxSizing:'border-box',
                    background:'var(--bg)', border:'1.5px solid var(--border)',
                    borderRadius:8, padding:'12px 14px',
                    color:'var(--text)', fontSize:14, lineHeight:1.7,
                    resize:'vertical', outline:'none', fontFamily:'inherit',
                    transition:'border-color .12s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:5, marginBottom:14 }}>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>
                    {(texts[page.id] || '').length} characters
                    {' · '}
                    ~{Math.ceil((texts[page.id] || '').split(/\s+/).filter(Boolean).length / 130)} min read aloud
                  </span>
                </div>
              </div>

              {/* ── Audio section ── */}
              <div style={{
                borderTop:'1px solid var(--border)',
                padding:'14px 16px',
                display:'flex', alignItems:'center', gap:12,
              }}>
                <span style={{ fontSize:12, fontWeight:600, color:'var(--muted)', flexShrink:0 }}>♪ Audio</span>

                {audioUrl ? (
                  /* Existing audio */
                  <div style={{ flex:1, display:'flex', alignItems:'center', gap:10 }}>
                    <audio
                      src={audioUrl}
                      controls
                      style={{ flex:1, height:32, minWidth:0 }}
                    />
                    <label style={{ flexShrink:0 }}>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize:11, pointerEvents:'none' }}
                        onClick={undefined}
                      >
                        {isUploading ? 'Uploading…' : '↺ Replace'}
                      </button>
                      <input
                        type="file"
                        accept="audio/mpeg,audio/ogg,audio/wav,audio/aac,audio/mp4"
                        style={{ display:'none' }}
                        onChange={e => handleAudioUpload(page.id, e.target.files[0])}
                        disabled={isUploading}
                      />
                    </label>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize:11, color:'var(--red)', flexShrink:0 }}
                      onClick={() => handleAudioRemove(page.id)}
                    >
                      ✕ Remove
                    </button>
                  </div>
                ) : (
                  /* No audio yet */
                  <label style={{ flex:1, display:'flex', alignItems:'center' }}>
                    <div style={{
                      flex:1, border:'1.5px dashed var(--border)', borderRadius:8,
                      padding:'10px 16px', display:'flex', alignItems:'center', gap:10,
                      cursor: isUploading ? 'default' : 'pointer',
                      transition:'border-color .12s, background .12s',
                    }}
                      onMouseEnter={e => { if (!isUploading) { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.background='rgba(99,102,241,.05)'; }}}
                      onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='transparent'; }}
                    >
                      <span style={{ fontSize:18, opacity:.5 }}>♪</span>
                      <span style={{ fontSize:12, color:'var(--muted)' }}>
                        {isUploading ? 'Uploading…' : 'Click to upload audio (MP3, AAC, OGG, WAV)'}
                      </span>
                    </div>
                    <input
                      type="file"
                      accept="audio/mpeg,audio/ogg,audio/wav,audio/aac,audio/mp4"
                      style={{ display:'none' }}
                      onChange={e => handleAudioUpload(page.id, e.target.files[0])}
                      disabled={isUploading}
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}

        {pages.length === 0 && (
          <div style={{ textAlign:'center', padding:48, color:'var(--muted)' }}>
            <div style={{ fontSize:36, marginBottom:12, opacity:.3 }}>📄</div>
            <div>No pages found. Add pages in the editor first.</div>
          </div>
        )}
      </div>

      {/* Toast */}
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}
