import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { loadGoogleFont, loadCustomFont, resolveFormat } from './EditorPage';

// ── Helpers ───────────────────────────────────────────────────────────────────
function elStyle(el) {
  return {
    position: 'absolute',
    left:   el.col_start * 100 + '%',
    top:    el.row_start * 100 + '%',
    width:  el.col_span  * 100 + '%',
    height: el.row_span  * 100 + '%',
    zIndex: el.layer * 100 + (el.z_index || 0),
    overflow: el.type === 'curvetext' ? 'visible' : 'hidden',
  };
}

// ── Curve Text viewer ─────────────────────────────────────────────────────────
function CurveTextViewer({ el }) {
  const wrapRef = useRef(null);
  const [dims, setDims] = useState(null);

  useEffect(() => {
    const domEl = wrapRef.current;
    if (!domEl) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ width, height });
    });
    ro.observe(domEl);
    return () => ro.disconnect();
  }, []);

  const p   = el.props || {};
  const pts = p.pts || [
    { x: 0.05, y: 0.70 }, { x: 0.30, y: 0.10 },
    { x: 0.70, y: 0.10 }, { x: 0.95, y: 0.70 },
  ];
  const [p0, p1, p2, p3] = pts;

  function buildD(W, H) {
    if (p.side === 'below') {
      return `M ${p3.x*W} ${p3.y*H} C ${p2.x*W} ${p2.y*H} ${p1.x*W} ${p1.y*H} ${p0.x*W} ${p0.y*H}`;
    }
    return `M ${p0.x*W} ${p0.y*H} C ${p1.x*W} ${p1.y*H} ${p2.x*W} ${p2.y*H} ${p3.x*W} ${p3.y*H}`;
  }

  const pathId = `vct-${el.id}`;

  return (
    <div ref={wrapRef} style={{ position:'absolute', inset:0, overflow:'visible', pointerEvents:'none' }}>
      {dims && (() => {
        const { width: W, height: H } = dims;
        const d = buildD(W, H);
        const txt = p.text || '';
        if (!txt) return null;
        return (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
            style={{ position:'absolute', inset:0, overflow:'visible' }}
          >
            <defs>
              <path id={pathId} d={d} />
            </defs>
            <text
              fontFamily={`'${p.fontFamily||'Inter'}', sans-serif`}
              fontSize={p.fontSize||20}
              fill={p.color||'#222222'}
              fontWeight={p.bold ? 'bold' : 'normal'}
              fontStyle={p.italic ? 'italic' : 'normal'}
              letterSpacing={p.letterSpacing||0}
            >
              <textPath href={`#${pathId}`} startOffset={(p.startOffset!=null ? p.startOffset : 0) + '%'}>
                {txt}
              </textPath>
            </text>
          </svg>
        );
      })()}
    </div>
  );
}

function ElementContent({ el }) {
  const p = el.props || {};

  if (el.type === 'bg') return (
    <div style={{ width:'100%', height:'100%', background: p.color || 'linear-gradient(135deg,#1e293b,#0f172a)' }} />
  );

  if (el.type === 'image' || el.type === 'gif') {
    if (!p.src) return null;
    return <img src={p.src} style={{ width:'100%', height:'100%', objectFit: p.fit || 'cover', display:'block' }} alt={p.altText || ''} />;
  }

  if (el.type === 'text') {
    if (!p.content) return null;
    return (
      <div style={{
        width:'100%', height:'100%', padding:'8px 10px', overflow:'hidden', boxSizing:'border-box',
        fontFamily: `'${p.fontFamily || 'Inter'}', sans-serif`,
        fontSize: (p.fontSize || 18) + 'px',
        color: p.color || '#222',
        textAlign: p.align || 'left',
        fontWeight: p.bold ? 'bold' : 'normal',
        fontStyle: p.italic ? 'italic' : 'normal',
        textDecoration: p.underline ? 'underline' : 'none',
        lineHeight: p.lineHeight || 1.4,
        letterSpacing: (p.letterSpacing || 0) + 'px',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {p.content}
      </div>
    );
  }

  if (el.type === 'video') {
    if (!p.src) return null;
    return <video src={p.src} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} muted loop autoPlay playsInline />;
  }

  if (el.type === 'audio') {
    if (!p.src) return null;
    return <audio src={p.src} autoPlay style={{ display: 'none' }}
      ref={node => { if (node) node.volume = p.volume ?? 1.0; }} />;
  }

  if (el.type === 'sfx') {
    if (!p.src) return null;
    return <audio src={p.src} autoPlay style={{ display: 'none' }}
      ref={node => { if (node) node.volume = p.volume ?? 0.3; }} />;
  }

  if (el.type === 'link') {
    return (
      <a href={p.url || '#'} target="_blank" rel="noopener noreferrer"
        style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(168,85,247,.15)', border:'1px solid rgba(168,85,247,.3)',
          color:'#a78bfa', fontSize:13, fontWeight:600, textDecoration:'none' }}>
        🔗 {p.label || 'Visit Page'}
      </a>
    );
  }

  if (el.type === 'curvetext') return <CurveTextViewer el={el} />;

  return null;
}

// ── Main viewer ───────────────────────────────────────────────────────────────
export default function ViewerPage() {
  const { slug } = useParams();
  const [book,    setBook]    = useState(null);
  const [pages,   setPages]   = useState([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [direction,     setDirection]     = useState(null);
  const [showUI,  setShowUI]  = useState(true);
  const [vpSize,  setVpSize]  = useState({ w: window.innerWidth, h: window.innerHeight });
  const uiTimer = useRef(null);

  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  // Track viewport size for scale calculation
  useEffect(() => {
    function onResize() { setVpSize({ w: window.innerWidth, h: window.innerHeight }); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    fetch(`/api/v1/public/books/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Book not found')))
      .then(data => {
        setBook(data);
        setPages(data.pages || []);
        // Pre-load custom uploaded fonts
        (data.custom_fonts || []).forEach(f => loadCustomFont(f.family, f.url));
        // Pre-load Google Fonts used in text and curvetext elements
        (data.pages || []).forEach(pg =>
          (pg.elements || []).forEach(el => {
            if ((el.type === 'text' || el.type === 'curvetext') && el.props?.fontFamily)
              loadGoogleFont(el.props.fontFamily);
          })
        );
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  // Auto-hide UI after 3s of inactivity
  function revealUI() {
    setShowUI(true);
    clearTimeout(uiTimer.current);
    uiTimer.current = setTimeout(() => setShowUI(false), 3000);
  }

  useEffect(() => {
    revealUI();
    return () => clearTimeout(uiTimer.current);
  }, [current]);

  function goTo(index, dir) {
    if (transitioning || index < 0 || index >= pages.length) return;
    setDirection(dir);
    setTransitioning(true);
    setTimeout(() => {
      setCurrent(index);
      setTransitioning(false);
      setDirection(null);
    }, 280);
  }

  function prev() { goTo(current - 1, 'right'); }
  function next() { goTo(current + 1, 'left');  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { next(); revealUI(); }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { prev(); revealUI(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, pages.length, transitioning]);

  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    revealUI();
  }

  function onTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) next(); else prev();
    }
    touchStartX.current = null;
  }

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) return (
    <div style={fullscreen}>
      <div style={{ color:'rgba(255,255,255,.5)', fontSize:14 }}>Loading…</div>
    </div>
  );

  if (error) return (
    <div style={fullscreen}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>📖</div>
        <div style={{ fontSize:18, color:'#fff', fontWeight:700, marginBottom:8 }}>Book not found</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,.5)' }}>{error}</div>
      </div>
    </div>
  );

  if (!pages.length) return (
    <div style={fullscreen}>
      <div style={{ color:'rgba(255,255,255,.5)', fontSize:14 }}>This book has no pages.</div>
    </div>
  );

  const page    = pages[current];
  const isFirst = current === 0;
  const isLast  = current === pages.length - 1;
  const fmt     = resolveFormat(book.orientation);

  // Scale the canvas to fill as much of the viewport as possible while
  // preserving the native pixel layout (fonts, borders, etc. all stay exact).
  const scale = Math.min(vpSize.w / fmt.w, vpSize.h / fmt.h);

  // Slide transition offset in native pixels (proportional to canvas width)
  const slideOffset = Math.round(fmt.w * 0.07);

  return (
    <div
      style={{ ...fullscreen, cursor:'none', overflow:'hidden' }}
      onMouseMove={revealUI}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={revealUI}
    >
      {/* ── Canvas — rendered at native size, scaled to viewport ── */}
      <div style={{
        width: fmt.w, height: fmt.h, flexShrink: 0,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        background: '#fff',
        boxShadow: `0 ${Math.round(20 * scale)}px ${Math.round(80 * scale)}px rgba(0,0,0,.7)`,
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Page elements — with slide transition */}
        <div style={{
          position:'absolute', inset:0,
          opacity: transitioning ? 0 : 1,
          transform: transitioning
            ? `translateX(${direction === 'left' ? -slideOffset : slideOffset}px)`
            : 'translateX(0)',
          transition:'opacity .28s ease, transform .28s ease',
        }}>
          {(page.elements || [])
            .sort((a, b) => (a.layer * 100 + a.z_index) - (b.layer * 100 + b.z_index))
            .map(el => (
              <div key={el.id} style={elStyle(el)}>
                <ElementContent el={el} />
              </div>
            ))}
        </div>
      </div>

      {/* ── UI overlay (fades in/out) ── */}
      <div style={{
        position:'fixed', inset:0, pointerEvents:'none',
        opacity: showUI ? 1 : 0,
        transition:'opacity .4s ease',
      }}>
        {/* Top bar */}
        <div style={{
          position:'absolute', top:0, left:0, right:0,
          padding:'16px 20px', display:'flex', alignItems:'center', gap:12,
          background:'linear-gradient(to bottom, rgba(0,0,0,.5), transparent)',
        }}>
          <span style={{ fontSize:14, fontWeight:800, color:'#fff', letterSpacing:-.3 }}>◈ {book.title}</span>
          <div style={{ flex:1 }} />
          <span style={{ fontSize:12, color:'rgba(255,255,255,.6)', fontWeight:600 }}>
            {current + 1} / {pages.length}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'rgba(255,255,255,.15)' }}>
          <div style={{ height:'100%', background:'#6366f1', width: ((current + 1) / pages.length * 100) + '%', transition:'width .3s' }} />
        </div>

        {/* Prev arrow */}
        {!isFirst && (
          <div
            style={{ ...arrowBtn, left:16, pointerEvents:'auto', cursor:'pointer' }}
            onClick={prev}
          >‹</div>
        )}

        {/* Next arrow */}
        {!isLast && (
          <div
            style={{ ...arrowBtn, right:16, pointerEvents:'auto', cursor:'pointer' }}
            onClick={next}
          >›</div>
        )}

        {/* Dot nav */}
        <div style={{
          position:'absolute', bottom:20, left:'50%', transform:'translateX(-50%)',
          display:'flex', gap:6, alignItems:'center',
        }}>
          {pages.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === current ? 20 : 6, height:6, borderRadius:3,
                background: i === current ? '#fff' : 'rgba(255,255,255,.4)',
                transition:'all .2s', cursor:'pointer', pointerEvents:'auto',
              }}
              onClick={() => goTo(i, i > current ? 'left' : 'right')}
            />
          ))}
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; overflow: hidden; }
      `}</style>
    </div>
  );
}

const fullscreen = {
  width: '100vw', height: '100vh',
  background: '#0a0a0f',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  userSelect: 'none', WebkitUserSelect: 'none',
};

const arrowBtn = {
  position: 'absolute', top: '50%', transform: 'translateY(-50%)',
  width: 48, height: 48, borderRadius: '50%',
  background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(8px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 28, color: '#fff', fontWeight: 300,
  transition: 'background .15s',
};
