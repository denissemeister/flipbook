import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

export default function ReadAloudReaderPage() {
  const { slug } = useParams();
  const [book,    setBook]    = useState(null);
  const [pages,   setPages]   = useState([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [direction, setDirection] = useState(null); // 'left' | 'right'

  // Hidden audio element for auto-play
  const audioRef = useRef(null);

  // Touch tracking
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  useEffect(() => {
    fetch(`/api/v1/public/books/${slug}/read-aloud`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Not found')))
      .then(data => {
        setBook(data);
        // Include pages that have text or audio
        const withContent = (data.pages || []).filter(p => p.read_aloud_text?.trim() || p.read_aloud_audio);
        setPages(withContent.length ? withContent : data.pages || []);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  // Auto-play audio when page changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !pages.length) return;
    const page = pages[current];
    if (page?.read_aloud_audio) {
      audio.src = page.read_aloud_audio;
      audio.currentTime = 0;
      audio.play().catch(() => {}); // browser autoplay policy may block silently
    } else {
      audio.pause();
      audio.src = '';
    }
  }, [current, pages]);

  function goTo(index, dir) {
    if (transitioning) return;
    if (index < 0 || index >= pages.length) return;
    // Stop current audio before transitioning
    if (audioRef.current) audioRef.current.pause();
    setDirection(dir);
    setTransitioning(true);
    setTimeout(() => {
      setCurrent(index);
      setTransitioning(false);
      setDirection(null);
    }, 220);
  }

  function prev() { goTo(current - 1, 'right'); }
  function next() { goTo(current + 1, 'left');  }

  // Keyboard navigation
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next();
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   prev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, pages.length, transitioning]);

  // Touch/swipe
  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) next();
      else prev();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) return (
    <div style={screen}>
      <div style={{ color:'#9ca3af', fontSize:15 }}>Loading…</div>
    </div>
  );

  if (error) return (
    <div style={screen}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>📖</div>
        <div style={{ fontSize:16, color:'#374151', fontWeight:600, marginBottom:8 }}>Book not available</div>
        <div style={{ fontSize:13, color:'#9ca3af' }}>{error}</div>
      </div>
    </div>
  );

  if (!pages.length) return (
    <div style={screen}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>📖</div>
        <div style={{ fontSize:16, color:'#374151', fontWeight:600 }}>No content to display</div>
      </div>
    </div>
  );

  const page      = pages[current];
  const isFirst   = current === 0;
  const isLast    = current === pages.length - 1;
  const isCover   = page.page_number === 1;
  const progress  = ((current + 1) / pages.length) * 100;
  const pageLabel = isCover ? 'Cover' : `Page ${page.page_number}`;
  const hasAudio  = !!page.read_aloud_audio;

  return (
    <div
      style={screen}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Hidden audio element drives auto-play */}
      <audio ref={audioRef} style={{ display:'none' }} />

      {/* Progress bar */}
      <div style={{ position:'fixed', top:0, left:0, right:0, height:3, background:'#f3f4f6', zIndex:10 }}>
        <div style={{ height:'100%', background:'#6366f1', width: progress + '%', transition:'width .3s ease' }} />
      </div>

      {/* Top bar */}
      <div style={{
        position:'fixed', top:0, left:0, right:0, zIndex:9,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'14px 20px', background:'rgba(255,255,255,.92)', backdropFilter:'blur(10px)',
        borderBottom:'1px solid #f3f4f6',
      }}>
        <div style={{ fontSize:14, fontWeight:800, color:'#6366f1', letterSpacing:-.3 }}>
          ◈ {book?.title}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {hasAudio && <AudioWave />}
          <div style={{ fontSize:12, color:'#9ca3af', fontWeight:600 }}>
            {current + 1} / {pages.length}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div
        style={{
          flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding:'80px 28px 100px', maxWidth:640, margin:'0 auto', width:'100%', boxSizing:'border-box',
          opacity: transitioning ? 0 : 1,
          transform: transitioning
            ? `translateX(${direction === 'left' ? '-40px' : '40px'})`
            : 'translateX(0)',
          transition:'opacity .22s ease, transform .22s ease',
        }}
      >
        {/* Page label */}
        <div style={{ fontSize:12, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', color:'#9ca3af', marginBottom:20 }}>
          {pageLabel}
        </div>

        {/* Text */}
        <p style={{
          fontSize: 'clamp(22px, 5vw, 32px)',
          lineHeight: 1.65,
          color: '#111827',
          textAlign: 'center',
          margin: 0,
          fontWeight: isCover ? 700 : 400,
          letterSpacing: isCover ? -.5 : 0,
        }}>
          {page.read_aloud_text || ''}
        </p>

        {/* Visible audio controls (when page has audio) */}
        {hasAudio && (
          <div style={{ marginTop:32, width:'100%', maxWidth:360 }}>
            <audio
              src={page.read_aloud_audio}
              controls
              style={{ width:'100%', borderRadius:8 }}
              onEnded={() => { if (!isLast) setTimeout(() => next(), 800); }}
            />
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <div style={{
        position:'fixed', bottom:0, left:0, right:0,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'16px 20px', background:'rgba(255,255,255,.92)', backdropFilter:'blur(10px)',
        borderTop:'1px solid #f3f4f6',
      }}>
        {/* Prev */}
        <button
          onClick={prev}
          disabled={isFirst}
          style={{
            width:48, height:48, borderRadius:'50%', border:'1.5px solid',
            borderColor: isFirst ? '#e5e7eb' : '#6366f1',
            background: isFirst ? '#f9fafb' : '#fff',
            color: isFirst ? '#d1d5db' : '#6366f1',
            fontSize:20, cursor: isFirst ? 'default' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
            transition:'all .15s',
          }}
        >←</button>

        {/* Page dots */}
        <div style={{ display:'flex', gap:6, alignItems:'center', flex:1, justifyContent:'center', padding:'0 12px', overflow:'hidden' }}>
          {pages.map((_, i) => (
            <div
              key={i}
              onClick={() => goTo(i, i > current ? 'left' : 'right')}
              style={{
                width: i === current ? 20 : 7,
                height:7, borderRadius:4,
                background: i === current ? '#6366f1' : '#e5e7eb',
                transition:'all .2s', cursor:'pointer', flexShrink:0,
              }}
            />
          ))}
        </div>

        {/* Next */}
        <button
          onClick={next}
          disabled={isLast}
          style={{
            width:48, height:48, borderRadius:'50%', border:'1.5px solid',
            borderColor: isLast ? '#e5e7eb' : '#6366f1',
            background: isLast ? '#f9fafb' : '#6366f1',
            color: isLast ? '#d1d5db' : '#fff',
            fontSize:20, cursor: isLast ? 'default' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
            transition:'all .15s',
          }}
        >→</button>
      </div>

      {/* Swipe hint */}
      {current === 0 && pages.length > 1 && (
        <div style={{
          position:'fixed', bottom:90, left:'50%', transform:'translateX(-50%)',
          background:'rgba(0,0,0,.65)', color:'#fff', fontSize:12, fontWeight:600,
          padding:'7px 16px', borderRadius:20, pointerEvents:'none',
          animation:'fo-fade-out 3s ease forwards',
        }}>
          Swipe to turn pages
        </div>
      )}

      <style>{`
        @keyframes fo-fade-out {
          0%,60%  { opacity: 1; }
          100%    { opacity: 0; }
        }
        @keyframes fo-wave {
          0%, 100% { transform: scaleY(0.4); }
          50%      { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}

// Animated bars shown in the top bar when the current page has audio
function AudioWave() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:2, height:14 }}>
      {[0, 0.15, 0.3].map((delay, i) => (
        <div key={i} style={{
          width:3, height:14, background:'#6366f1', borderRadius:2,
          animation: `fo-wave .8s ease-in-out ${delay}s infinite`,
          transformOrigin: 'center',
        }} />
      ))}
    </div>
  );
}

const screen = {
  minHeight: '100vh',
  background: '#ffffff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  userSelect: 'none',
  WebkitUserSelect: 'none',
};
