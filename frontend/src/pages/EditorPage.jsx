import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

// ── Page formats ─────────────────────────────────────────────────────────────
export const PAGE_FORMATS = {
  'landscape-4-3':  { label: 'Landscape 4:3',  desc: 'iPad',        icon: '▬', w: 840, h: 630, cols: 8, rows: 6 },
  'portrait-2-3':   { label: 'Portrait 2:3',   desc: 'Book / Phone', icon: '▮', w: 560, h: 840, cols: 6, rows: 9 },
  'landscape-16-9': { label: 'Landscape 16:9', desc: 'Widescreen',   icon: '▬', w: 840, h: 473, cols: 8, rows: 5 },
  'portrait-3-4':   { label: 'Portrait 3:4',   desc: 'Classic',      icon: '▮', w: 630, h: 840, cols: 6, rows: 8 },
};

// Resolve legacy orientation values and unknown keys to a format object
export function resolveFormat(key) {
  if (key === 'horizontal') return PAGE_FORMATS['landscape-16-9'];
  if (key === 'vertical')   return PAGE_FORMATS['portrait-3-4'];
  return PAGE_FORMATS[key] || PAGE_FORMATS['landscape-4-3'];
}

// ── Google Fonts ──────────────────────────────────────────────────────────────
const GOOGLE_FONTS = [
  // Sans-serif
  'Roboto','Open Sans','Lato','Montserrat','Poppins','Nunito','Raleway','Ubuntu',
  'Oswald','Quicksand','Work Sans','Rubik','Source Sans 3','DM Sans','Plus Jakarta Sans',
  'Outfit','Figtree','Lexend','Josefin Sans','Exo 2','Mulish','Hind','Noto Sans',
  // Serif
  'Playfair Display','Merriweather','Lora','EB Garamond','Libre Baskerville',
  'Cormorant Garamond','Crimson Text','Arvo','Bitter','Cardo',
  // Display / handwriting
  'Pacifico','Lobster','Dancing Script','Caveat','Satisfy','Permanent Marker',
  'Fredoka','Righteous','Boogaloo','Lilita One','Comfortaa','Baloo 2',
  'Chewy','Titan One','Yeseva One','Cinzel',
  // Monospace
  'Fira Code','Space Mono','JetBrains Mono','Source Code Pro',
].sort();

const _loadedFonts = new Set();

export function loadGoogleFont(family) {
  if (!family || _loadedFonts.has(family)) return;
  // Skip system fonts
  const system = ['Inter','Georgia','Helvetica Neue','Times New Roman','Courier New','Arial','Verdana'];
  if (system.includes(family)) return;
  _loadedFonts.add(family);
  const link = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

// Custom font loading via FontFace API
const _loadedCustomFonts = new Set();

export function loadCustomFont(family, url) {
  if (!family || !url || _loadedCustomFonts.has(family)) return;
  _loadedCustomFonts.add(family);
  const font = new FontFace(family, `url(${url})`);
  font.load()
    .then(f => document.fonts.add(f))
    .catch(() => _loadedCustomFonts.delete(family)); // allow retry on error
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const LAYER_NAMES = ['', 'Background', 'Images', 'Text', 'Audio', 'Sound Effects'];
const DEFAULT_LAYER = { text: 3, image: 2, gif: 2, video: 2, link: 3, audio: 4, bg: 1, sfx: 5, curvetext: 3 };
const DEFAULT_SIZE  = {
  text:  { w: 0.4, h: 0.2 }, image: { w: 0.4, h: 0.4 },
  gif:   { w: 0.3, h: 0.3 }, video: { w: 0.4, h: 0.4 },
  link:  { w: 0.24, h: 0.1 }, audio: { w: 0.3, h: 0.1 },
  sfx:   { w: 0.3, h: 0.1 }, bg: { w: 1, h: 1 },
  curvetext: { w: 0.6, h: 0.35 },
};

function elStyle(el) {
  return {
    position: 'absolute',
    left:   el.col_start * 100 + '%',
    top:    el.row_start * 100 + '%',
    width:  el.col_span  * 100 + '%',
    height: el.row_span  * 100 + '%',
    zIndex: el.layer * 100 + (el.z_index || 0),
  };
}

let toastTimer;
function useToast() {
  const [msg, setMsg] = useState('');
  function show(m) { setMsg(m); clearTimeout(toastTimer); toastTimer = setTimeout(() => setMsg(''), 2400); }
  return [msg, show];
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [toast, showToast] = useToast();

  const [book, setBook]           = useState(null);
  const [pages, setPages]         = useState([]);
  const [elements, setElements]   = useState({}); // { [pageId]: [...] }
  const [activePage, setActivePage] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set()); // multi-select
  const [editingId,   setEditingId]   = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [orientation, setOrientation] = useState('horizontal');
  const [zoom, setZoom]           = useState(100);
  const [showGrid, setShowGrid]   = useState(true);
  const [loading, setLoading]     = useState(true);
  const [customFonts, setCustomFonts] = useState([]); // [{id, family, url}]
  const [previewVideoUrl, setPreviewVideoUrl] = useState('');
  const [pageNavMode, setPageNavMode] = useState(false); // true = show go-to-page input
  const [dragInfo, setDragInfo] = useState(null); // null | { elCX, elCY } (0–1 fractions)
  const [selectedPageIds, setSelectedPageIds] = useState(new Set()); // page multi-select
  const [pageContextMenu, setPageContextMenu] = useState(null);      // null | { x, y, pageIds }
  const previewVideoTimer = useRef(null);

  const undoStack    = useRef([]); // [{ pageId, snapshot }]
  const clipboardEls = useRef([]); // copied elements array
  const saveTimer    = useRef(null);
  const canvasRef    = useRef(null);

  // ── Load book ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const bookData = await api.get(`/books/${id}`);
        setBook(bookData);
        setOrientation(bookData.orientation);
        setPreviewVideoUrl(bookData.preview_video_url || '');
        const pgs = bookData.pages || [];
        setPages(pgs);
        if (pgs.length) setActivePage(pgs[0]);
      } catch (err) {
        showToast('Failed to load book: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // ── Load custom uploaded fonts ─────────────────────────────────────────────
  useEffect(() => {
    api.get('/fonts')
      .then(fonts => {
        setCustomFonts(fonts);
        fonts.forEach(f => loadCustomFont(f.family, f.url));
      })
      .catch(() => {}); // non-critical
  }, []);

  // ── Load elements when active page changes ─────────────────────────────────
  useEffect(() => {
    if (!activePage) return;
    if (elements[activePage.id]) return; // already loaded
    api.get(`/pages/${activePage.id}/elements`)
      .then(els => {
        // Pre-load any Google Fonts already stored in text elements
        els.forEach(el => { if (el.type === 'text' && el.props?.fontFamily) loadGoogleFont(el.props.fontFamily); });
        setElements(prev => ({ ...prev, [activePage.id]: els }));
      })
      .catch(err => showToast('Failed to load elements: ' + err.message));
  }, [activePage]);

  // ── Scroll pages panel to keep active page visible ────────────────────────
  useEffect(() => {
    if (!activePage) return;
    document.querySelector(`[data-page-id="${activePage.id}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activePage?.id]);

  // ── Auto-save (debounced) ──────────────────────────────────────────────────
  async function doSave(pageId, els) {
    setSaveStatus('saving');
    try {
      const payload = els.map(e => ({
        id: e._new ? undefined : e.id,
        layer: e.layer, type: e.type,
        col_start: e.col_start, row_start: e.row_start,
        col_span: e.col_span, row_span: e.row_span,
        z_index: e.z_index || 0,
        props: e.props || {},
      }));
      const saved = await api.post(`/pages/${pageId}/elements/batch`, { elements: payload });
      // Sync server-assigned IDs back into client state so subsequent saves
      // UPDATE existing rows instead of INSERTing duplicates.
      if (Array.isArray(saved) && saved.length) {
        const idUpdates = {};
        els.forEach((el, i) => {
          if (el._new && saved[i]?.id) idUpdates[el.id] = saved[i].id;
        });
        if (Object.keys(idUpdates).length) {
          setElements(prev => {
            const current = prev[pageId] || [];
            return {
              ...prev,
              [pageId]: current.map(el =>
                idUpdates[el.id] ? { ...el, id: idUpdates[el.id], _new: false } : el
              ),
            };
          });
        }
      }
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('unsaved');
      showToast('⚠ Save failed: ' + (err?.message || 'unknown error'));
    }
  }

  const scheduleSave = useCallback((pageId, els) => {
    setSaveStatus('unsaved');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(pageId, els), 700);
  }, []);

  function saveNow() {
    if (!activePage) return;
    clearTimeout(saveTimer.current);
    doSave(activePage.id, elements[activePage.id] || []);
  }

  function updateElements(pageId, newEls) {
    setElements(prev => ({ ...prev, [pageId]: newEls }));
    scheduleSave(pageId, newEls);
  }

  // ── Undo ───────────────────────────────────────────────────────────────────
  function pushUndo(pageId, label) {
    const snap = JSON.parse(JSON.stringify(elements[pageId] || []));
    undoStack.current.push({ pageId, snap, label });
    if (undoStack.current.length > 50) undoStack.current.shift();
  }

  function undo() {
    if (!undoStack.current.length) return;
    const { pageId, snap, label } = undoStack.current.pop();
    setElements(prev => ({ ...prev, [pageId]: snap }));
    showToast('↩ Undid: ' + label);
  }

  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName;
      const editable = document.activeElement?.isContentEditable;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || editable;

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault(); saveNow();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !inField && selectedIds.size) {
        e.preventDefault(); copyEls();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !inField) {
        e.preventDefault(); pasteEls();
      }
      if (e.key === 'Escape') { setSelectedIds(new Set()); setEditingId(null); }

      // Delete selected elements — or active page if nothing is selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inField) {
        if (selectedIds.size) {
          e.preventDefault(); deleteSelectedEls();
        } else if (activePage) {
          e.preventDefault(); deletePage(activePage);
        }
      }

      // Arrow keys — nudge all selected elements
      if (!inField && !editingId && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        if (selectedIds.size && activePage) {
          // ── Nudge selected elements ─────────────────────────────────────────
          e.preventDefault();
          const step = e.shiftKey ? 0.01 : 0.002;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
          const pageId = activePage.id;
          const newEls = (elements[pageId] || []).map(el =>
            !selectedIds.has(el.id) ? el : {
              ...el,
              col_start: Math.max(0, Math.min(1 - el.col_span, el.col_start + dx)),
              row_start: Math.max(0, Math.min(1 - el.row_span, el.row_start + dy)),
            }
          );
          updateElements(pageId, newEls);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // ── Navigate pages ──────────────────────────────────────────────────
          e.preventDefault();
          const idx = pages.findIndex(p => p.id === activePage?.id);
          const next = e.key === 'ArrowUp' ? idx - 1 : idx + 1;
          if (next >= 0 && next < pages.length) {
            setActivePage(pages[next]);
            setSelectedIds(new Set());
          }
        }
      }
    }
    // ── Native copy / cut / paste for text elements ───────────────────────
    // Uses e.clipboardData — no browser permission required.
    function isInField() {
      const t = document.activeElement?.tagName;
      return t === 'INPUT' || t === 'TEXTAREA' || document.activeElement?.isContentEditable;
    }
    function selectedTextEl() {
      return selectedEls.length === 1 &&
        (selectedEls[0].type === 'text' || selectedEls[0].type === 'curvetext')
        ? selectedEls[0] : null;
    }

    function onCopy(e) {
      if (isInField()) return;
      const textEl = selectedTextEl();
      if (!textEl) return;
      const ep = textEl.props || {};
      const content = textEl.type === 'text' ? (ep.content || '') : (ep.text || '');
      e.clipboardData?.setData('text/plain', content);
      e.preventDefault();
    }

    function onCut(e) {
      if (isInField()) return;
      const textEl = selectedTextEl();
      if (!textEl || !activePage) return;
      const ep = textEl.props || {};
      const content = textEl.type === 'text' ? (ep.content || '') : (ep.text || '');
      if (!content) return;
      e.clipboardData?.setData('text/plain', content);
      e.preventDefault();
      pushUndo(activePage.id, 'Cut text');
      if (textEl.type === 'text') {
        updateEl(textEl.id, { props: { ...ep, content: '' } });
      } else {
        updateEl(textEl.id, { props: { ...ep, text: '' } });
      }
      showToast('✂ Text cut');
    }

    function onPaste(e) {
      if (isInField()) return;
      const textEl = selectedTextEl();
      if (!textEl || !activePage) return;
      const text = e.clipboardData?.getData('text/plain') || '';
      if (!text) return;
      e.preventDefault();
      const ep = textEl.props || {};
      pushUndo(activePage.id, 'Paste text');
      if (textEl.type === 'text') {
        updateEl(textEl.id, { props: { ...ep, content: (ep.content ? ep.content + '\n' : '') + text } });
      } else {
        updateEl(textEl.id, { props: { ...ep, text: (ep.text ? ep.text + ' ' : '') + text } });
      }
      setEditingId(textEl.id);
    }

    window.addEventListener('keydown', onKey);
    window.addEventListener('copy',  onCopy);
    window.addEventListener('cut',   onCut);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('copy',  onCopy);
      window.removeEventListener('cut',   onCut);
      window.removeEventListener('paste', onPaste);
    };
  }, [selectedIds, editingId, elements, activePage, pages]);

  // ── Element operations ────────────────────────────────────────────────────
  function addElement(type) {
    if (!activePage) return;
    const sz = DEFAULT_SIZE[type] || { w: 0.3, h: 0.2 };
    const newEl = {
      id: 'new-' + Date.now(),
      _new: true,
      type, layer: DEFAULT_LAYER[type] || 2,
      col_start: (1 - sz.w) / 2,  // horizontally centered by default
      row_start: 0.1,
      col_span: sz.w, row_span: sz.h,
      z_index: 0, props: {},
    };
    const pageId = activePage.id;
    pushUndo(pageId, 'Add ' + type);
    const els = [...(elements[pageId] || []), newEl];
    updateElements(pageId, els);
    setSelectedIds(new Set([newEl.id]));
  }

  function updateEl(elId, changes) {
    if (!activePage) return;
    const pageId = activePage.id;
    const els = (elements[pageId] || []).map(e => e.id === elId ? { ...e, ...changes } : e);
    updateElements(pageId, els);
  }

  function deleteEl(elId) {
    if (!activePage) return;
    const pageId = activePage.id;
    pushUndo(pageId, 'Delete element');
    const els = (elements[pageId] || []).filter(e => e.id !== elId);
    updateElements(pageId, els);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(elId); return n; });
    showToast('Element deleted');
  }

  function deleteSelectedEls() {
    if (!activePage || !selectedIds.size) return;
    const pageId = activePage.id;
    pushUndo(pageId, 'Delete elements');
    const els = (elements[pageId] || []).filter(e => !selectedIds.has(e.id));
    updateElements(pageId, els);
    setSelectedIds(new Set());
    showToast(`${selectedIds.size} element${selectedIds.size > 1 ? 's' : ''} deleted`);
  }

  function duplicateEl(elId) {
    if (!activePage) return;
    const pageId = activePage.id;
    const src = (elements[pageId] || []).find(e => e.id === elId);
    if (!src) return;
    pushUndo(pageId, 'Duplicate');
    const copy = { ...src, id: 'new-' + Date.now(), _new: true, col_start: src.col_start + 0.02, row_start: src.row_start + 0.02 };
    const els = [...(elements[pageId] || []), copy];
    updateElements(pageId, els);
    setSelectedIds(new Set([copy.id]));
    showToast('Element duplicated');
  }

  function copyEls() {
    if (!activePage || !selectedIds.size) return;
    const toCopy = (elements[activePage.id] || []).filter(e => selectedIds.has(e.id));
    clipboardEls.current = toCopy.map(el => JSON.parse(JSON.stringify(el)));
    const n = clipboardEls.current.length;
    showToast(`✂ ${n} element${n > 1 ? 's' : ''} copied — switch page then paste`);
  }

  function pasteEls() {
    if (!activePage || !clipboardEls.current.length) return;
    const pageId = activePage.id;
    pushUndo(pageId, 'Paste');
    const OFFSET = 0.02;
    const newEls = clipboardEls.current.map(src => ({
      ...src,
      id: 'new-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      _new: true,
      col_start: Math.min(1 - src.col_span, src.col_start + OFFSET),
      row_start: Math.min(1 - src.row_span, src.row_start + OFFSET),
    }));
    updateElements(pageId, [...(elements[pageId] || []), ...newEls]);
    setSelectedIds(new Set(newEls.map(el => el.id)));
    const n = newEls.length;
    showToast(`📋 ${n} element${n > 1 ? 's' : ''} pasted`);
  }

  // ── Drag from sidebar onto canvas ─────────────────────────────────────────
  const ghostRef = useRef(null);
  const dropPreviewRef = useRef(null);

  function startSidebarDrag(e, type) {
    e.preventDefault();
    const ghost = ghostRef.current;
    const preview = dropPreviewRef.current;
    ghost.textContent = type;
    ghost.style.display = 'block';
    ghost.style.left = (e.clientX + 12) + 'px';
    ghost.style.top  = (e.clientY + 12) + 'px';

    const sz = DEFAULT_SIZE[type] || { w: 0.3, h: 0.2 };

    function onMove(ev) {
      ghost.style.left = (ev.clientX + 12) + 'px';
      ghost.style.top  = (ev.clientY + 12) + 'px';
      const canvas = canvasRef.current;
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const over = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      canvas.classList.toggle('drop-target', over);
      if (over && preview) {
        const relX = (ev.clientX - r.left) / r.width;
        const relY = (ev.clientY - r.top)  / r.height;
        const left = Math.min(1 - sz.w, Math.max(0, relX - sz.w / 2));
        const top  = Math.min(1 - sz.h, Math.max(0, relY - sz.h / 2));
        preview.style.display = 'block';
        preview.style.left   = left * 100 + '%';
        preview.style.top    = top  * 100 + '%';
        preview.style.width  = sz.w * 100 + '%';
        preview.style.height = sz.h * 100 + '%';
      } else if (preview) {
        preview.style.display = 'none';
      }
    }

    function onUp(ev) {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup',   onUp);
      ghost.style.display = 'none';
      if (preview) preview.style.display = 'none';
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.classList.remove('drop-target');
      const r = canvas.getBoundingClientRect();
      const over = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (!over || !activePage) return;
      const relX = (ev.clientX - r.left) / r.width;
      const relY = (ev.clientY - r.top)  / r.height;
      const col_start = Math.round(Math.min(1 - sz.w, Math.max(0, relX - sz.w / 2)) * 1000) / 1000;
      const row_start = Math.round(Math.min(1 - sz.h, Math.max(0, relY - sz.h / 2)) * 1000) / 1000;
      const newEl = {
        id: 'new-' + Date.now(), _new: true, type,
        layer: DEFAULT_LAYER[type] || 2,
        col_start, row_start, col_span: sz.w, row_span: sz.h,
        z_index: 0, props: {},
      };
      const pageId = activePage.id;
      pushUndo(pageId, 'Add ' + type);
      updateElements(pageId, [...(elements[pageId] || []), newEl]);
      setSelectedIds(new Set([newEl.id]));
      showToast(type + ' added');
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
  }

  // ── Page management ────────────────────────────────────────────────────────
  async function reloadPages(selectPageId) {
    const bookData = await api.get(`/books/${id}`);
    const newPages = bookData.pages || [];
    setPages(newPages);
    if (selectPageId) {
      const target = newPages.find(p => p.id === selectPageId) || newPages[0];
      if (target) setActivePage(target);
    } else if (activePage && !newPages.find(p => p.id === activePage.id)) {
      setActivePage(newPages[0] || null);
    }
  }

  async function addPage() {
    if (pages.length >= 100) { showToast('Maximum 100 pages'); return; }
    try {
      const newPage = await api.post(`/books/${id}/pages`, {});
      setPages(prev => [...prev, newPage]);
      setActivePage(newPage);
      setSelectedPageIds(new Set([newPage.id]));
      showToast('Page ' + newPage.page_number + ' added');
    } catch (err) { showToast(err.message); }
  }

  async function addPageAt(position, refPageId) {
    if (pages.length >= 100) { showToast('Maximum 100 pages'); return; }
    try {
      const refPage = pages.find(p => p.id === refPageId);
      const newPage = await api.post(`/books/${id}/pages`, {});
      const targetNum = position === 'before' ? refPage.page_number : refPage.page_number + 1;
      await api.patch(`/books/${id}/pages/${newPage.id}/reorder`, { page_number: targetNum });
      await reloadPages(newPage.id);
      showToast(`Page added ${position === 'before' ? 'before' : 'after'} page ${refPage.page_number}`);
    } catch (err) { showToast(err.message); }
  }

  async function duplicatePage(pageId) {
    try {
      const newPage = await api.post(`/books/${id}/pages/${pageId}/duplicate`, {});
      await reloadPages(newPage.id);
      showToast('Page duplicated');
    } catch (err) { showToast(err.message); }
  }

  async function deletePages(pageIds) {
    if (pages.length <= pageIds.length) { showToast('Cannot delete all pages'); return; }
    const label = pageIds.length > 1 ? `${pageIds.length} pages` : 'page';
    if (!confirm(`Delete ${label}?`)) return;
    try {
      for (const pid of pageIds) {
        await api.delete(`/books/${id}/pages/${pid}`);
      }
      // Update state directly (fast, no extra round-trip)
      const deletedSet = new Set(pageIds);
      const newPages = pages
        .filter(p => !deletedSet.has(p.id))
        .map((p, i) => ({ ...p, page_number: i + 1 }));
      setPages(newPages);
      setSelectedPageIds(new Set());
      if (activePage && deletedSet.has(activePage.id)) {
        setActivePage(newPages[0] || null);
      }
      showToast(`${pageIds.length > 1 ? pageIds.length + ' pages' : 'Page'} deleted`);
    } catch (err) { showToast(err.message); }
  }

  async function deletePage(page) {
    await deletePages([page.id]);
  }

  // ── Page background ────────────────────────────────────────────────────────
  function setPageBackground(color) {
    if (!activePage) return;
    const pageId = activePage.id;
    const els = elements[pageId] || [];
    const bgEl = els.find(e => e.type === 'bg');
    if (bgEl) {
      const newEls = els.map(e =>
        e.id === bgEl.id ? { ...e, props: { ...e.props, color } } : e
      );
      updateElements(pageId, newEls);
    } else {
      const newEl = {
        id: 'new-' + Date.now(), _new: true,
        type: 'bg', layer: 1,
        col_start: 0, row_start: 0, col_span: 1, row_span: 1,
        z_index: 0, props: { color },
      };
      updateElements(pageId, [...els, newEl]);
    }
  }

  // ── Media upload ───────────────────────────────────────────────────────────
  async function uploadMedia(file) {
    const form = new FormData();
    form.append('file', file);
    const asset = await api.upload('/media/upload', form);
    return asset.url; // permanent server path like /uploads/images/xyz.jpg
  }

  // ── Publish ────────────────────────────────────────────────────────────────
  async function publish() {
    try {
      const updated = await api.post(`/books/${id}/publish`, {});
      setBook(updated);
      showToast(`✓ Published! /view/${updated.slug}`);
    } catch (err) { showToast(err.message); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)', color:'var(--muted)' }}>
      Loading editor…
    </div>
  );

  const pageEls    = activePage ? (elements[activePage.id] || []) : [];
  const selectedEls = pageEls.filter(e => selectedIds.has(e.id));
  const selectedEl  = selectedEls.length === 1 ? selectedEls[0] : null; // single-select for PropsPanel

  const fmt     = resolveFormat(orientation);
  const canvasW = fmt.w;
  const canvasH = fmt.h;

  const saveColor = { saved: 'var(--green)', saving: 'var(--amber)', unsaved: 'var(--amber)' }[saveStatus];
  const saveLabel = { saved: '✓ Saved', saving: 'Saving…', unsaved: '● Unsaved' }[saveStatus];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── TOP BAR ── */}
      <div style={{
        height: 52, background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0,
      }}>
        <div
          style={{ fontSize: 15, fontWeight: 800, letterSpacing: -.5, cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          onClick={() => navigate('/admin')}
        >◈</div>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{book?.title || '…'}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: saveColor }}>{saveLabel}</span>
        <button
          className="btn btn-ghost"
          onClick={saveNow}
          disabled={saveStatus === 'saved' || saveStatus === 'saving'}
          style={{ fontSize: 11 }}
        >💾 Save</button>
        <button className="btn btn-ghost" onClick={undo} disabled={!undoStack.current.length} style={{ fontSize: 11 }}>↩ Undo</button>
        <button className="btn btn-ghost" onClick={() => navigate(`/admin/books/${id}/read-aloud`)} style={{ fontSize: 11 }}>🔊 Read Aloud</button>
        <button className="btn btn-ghost" onClick={() => window.open(`/view/${book?.slug}`, '_blank')} disabled={book?.status !== 'published'} style={{ fontSize: 11 }}>▶ Preview</button>
        <button className="btn btn-primary" onClick={publish}>✦ Publish</button>
      </div>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── SIDEBAR ── */}
        <div style={{
          width: 200, background: 'var(--surface)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          <div style={{ padding: '12px 14px 6px', fontSize: 10, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', color: 'var(--muted)' }}>
            Add Element
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', padding: '0 14px 8px', lineHeight: 1.5 }}>
            Drag onto canvas
          </div>

          {[
            { type:'text',  icon:'T',   label:'Text',          bg:'rgba(99,102,241,.2)' },
            { type:'image', icon:'🖼',  label:'Image',         bg:'rgba(34,197,94,.2)' },
            { type:'gif',   icon:'GIF', label:'Animated GIF',  bg:'rgba(245,158,11,.2)' },
            { type:'video', icon:'▶',   label:'Video',         bg:'rgba(239,68,68,.2)' },
            { type:'link',  icon:'🔗',  label:'Link',          bg:'rgba(168,85,247,.2)' },
            { type:'audio', icon:'♪',   label:'Audio',         bg:'rgba(14,165,233,.2)' },
            { type:'sfx',       icon:'✨',  label:'Sound Effects', bg:'rgba(168,85,247,.2)' },
            { type:'curvetext', icon:'∿T',  label:'Curve Text',    bg:'rgba(236,72,153,.2)' },
          ].map(item => (
            <div
              key={item.type}
              onPointerDown={e => startSidebarDrag(e, item.type)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', borderRadius: 7, margin: '1px 8px',
                cursor: 'grab', color: 'var(--text)', fontSize: 12.5, fontWeight: 500,
                userSelect: 'none', transition: 'background .12s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ width: 28, height: 28, borderRadius: 6, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                {item.icon}
              </div>
              {item.label}
            </div>
          ))}

          <div style={{ height: 1, background: 'var(--border)', margin: '8px 8px' }} />

          {/* Page format */}
          <div style={{ padding: '0 8px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .7, textTransform: 'uppercase', color: 'var(--muted)', padding: '6px 6px 6px' }}>
              Page Format
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Object.entries(PAGE_FORMATS).map(([key, f]) => {
                // Normalize current orientation to a canonical key for comparison
                const activeKey = PAGE_FORMATS[orientation] ? orientation
                  : orientation === 'horizontal' ? 'landscape-16-9'
                  : orientation === 'vertical'   ? 'portrait-3-4'
                  : 'landscape-4-3';
                const active = key === activeKey;
                return (
                  <div
                    key={key}
                    onClick={async () => {
                      setOrientation(key);
                      try { await api.patch(`/books/${id}`, { orientation: key }); }
                      catch { showToast('Failed to save format'); }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
                      border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      background: active ? 'var(--accent-glow)' : 'transparent',
                      transition: 'all .12s',
                    }}
                    onMouseOver={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,.04)'; }}
                    onMouseOut={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* Aspect-ratio miniature */}
                    <div style={{
                      width: f.w > f.h ? 26 : 18,
                      height: f.w > f.h ? Math.round(26 * f.h / f.w) : 26,
                      background: active ? 'var(--accent)' : 'var(--surface3)',
                      borderRadius: 2, flexShrink: 0,
                      opacity: active ? 1 : 0.5,
                    }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text)' }}>{f.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{f.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '0 8px' }} />

          {/* Book Settings */}
          <div style={{ padding: '8px 8px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .7, textTransform: 'uppercase', color: 'var(--muted)', padding: '6px 6px 6px' }}>
              Book Settings
            </div>
            <div style={{ padding: '0 6px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>Preview Video URL</div>
              <input
                className="input"
                style={{ fontSize: 11, padding: '5px 8px', width: '100%', boxSizing: 'border-box' }}
                placeholder="https://…"
                value={previewVideoUrl}
                onChange={e => {
                  const val = e.target.value;
                  setPreviewVideoUrl(val);
                  clearTimeout(previewVideoTimer.current);
                  previewVideoTimer.current = setTimeout(async () => {
                    try { await api.patch(`/books/${id}`, { preview_video_url: val || null }); }
                    catch { showToast('Failed to save video URL'); }
                  }, 800);
                }}
              />
            </div>
          </div>
        </div>

        {/* ── PAGE PANEL ── */}
        <div style={{
          width: 130, background: 'var(--surface)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--muted)' }}>Pages</span>
            {pageNavMode ? (
              <input
                autoFocus
                type="number" min={1} max={pages.length}
                placeholder={`1–${pages.length}`}
                style={{ width: 52, fontSize: 11, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--text)', padding: '1px 5px', outline: 'none' }}
                onBlur={() => setPageNavMode(false)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n) && n >= 1 && n <= pages.length) {
                      setActivePage(pages[n - 1]);
                      setSelectedIds(new Set());
                    }
                    setPageNavMode(false);
                  }
                  if (e.key === 'Escape') setPageNavMode(false);
                }}
              />
            ) : (
              <span
                title="Click to go to page"
                style={{ fontSize: 11, color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setPageNavMode(true)}
              >{pages.length}/100</span>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px' }}>
            {pages.map(page => {
              const isActive = activePage?.id === page.id;
              const isSel   = selectedPageIds.has(page.id);
              return (
                <div
                  key={page.id}
                  data-page-id={page.id}
                  onClick={e => {
                    if (e.metaKey || e.ctrlKey) {
                      setSelectedPageIds(prev => {
                        const n = new Set(prev);
                        if (n.has(page.id)) n.delete(page.id); else n.add(page.id);
                        return n;
                      });
                    } else if (e.shiftKey && selectedPageIds.size > 0) {
                      const lastId  = [...selectedPageIds].at(-1);
                      const lastIdx = pages.findIndex(p => p.id === lastId);
                      const thisIdx = pages.findIndex(p => p.id === page.id);
                      const [from, to] = [Math.min(lastIdx, thisIdx), Math.max(lastIdx, thisIdx)];
                      setSelectedPageIds(new Set(pages.slice(from, to + 1).map(p => p.id)));
                    } else {
                      setActivePage(page);
                      setSelectedIds(new Set());
                      setEditingId(null);
                      setSelectedPageIds(new Set([page.id]));
                    }
                  }}
                  onContextMenu={e => {
                    e.preventDefault();
                    const ids = selectedPageIds.has(page.id) ? [...selectedPageIds] : [page.id];
                    if (!selectedPageIds.has(page.id)) setSelectedPageIds(new Set([page.id]));
                    setPageContextMenu({ x: e.clientX, y: e.clientY, pageIds: ids });
                  }}
                  style={{
                    borderRadius: 6,
                    border: `2px solid ${isActive ? 'var(--accent)' : isSel ? 'rgba(99,102,241,.55)' : 'transparent'}`,
                    background: isSel && !isActive ? 'rgba(99,102,241,.08)' : 'transparent',
                    cursor: 'pointer', marginBottom: 5, overflow: 'hidden', transition: 'border-color .12s',
                    position: 'relative',
                  }}
                  onMouseEnter={e => { if (!isActive && !isSel) e.currentTarget.style.borderColor = 'rgba(99,102,241,.3)'; }}
                  onMouseLeave={e => { if (!isActive && !isSel) e.currentTarget.style.borderColor = 'transparent'; }}
                >
                  <div style={{ aspectRatio: `${fmt.w}/${fmt.h}`, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--border)', position: 'relative' }}>
                    ◈
                    <span style={{ position: 'absolute', bottom: 3, left: 5, fontSize: 9, fontWeight: 700, color: 'var(--muted)' }}>{page.page_number}</span>
                    {isSel && !isActive && (
                      <span style={{ position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedPageIds.size > 1 && (
            <div
              onClick={() => deletePages([...selectedPageIds])}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '6px 6px', margin: '0 6px 4px', borderRadius: 7,
                background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)',
                color: '#f87171', fontSize: 11, cursor: 'pointer',
              }}
            >🗑 Delete {selectedPageIds.size} pages</div>
          )}
          <div
            onClick={addPage}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '8px 6px', margin: '4px 6px 8px', borderRadius: 7,
              border: '1px dashed var(--border)', color: 'var(--muted)', fontSize: 11, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
          >
            + Add Page
          </div>
        </div>

        {/* ── CANVAS AREA ── */}
        <div
          style={{ flex: 1, background: '#090b12', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedIds(new Set()); }}
        >
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.04) 1px, transparent 1px)', backgroundSize: '24px 24px', pointerEvents: 'none' }} />

          <div
            ref={canvasRef}
            style={{
              position: 'relative',
              width: canvasW, height: canvasH,
              background: '#fff', borderRadius: 4,
              boxShadow: '0 0 0 1px rgba(255,255,255,.08), 0 32px 80px rgba(0,0,0,.6)',
              overflow: 'hidden',
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'center center',
            }}
            onClick={e => { if (e.target === e.currentTarget) setSelectedIds(new Set()); }}
          >
            {/* Grid */}
            {showGrid && <CanvasGrid fmt={fmt} />}

            {/* Drop preview */}
            <div ref={dropPreviewRef} style={{ position: 'absolute', display: 'none', border: '2px dashed var(--accent)', background: 'var(--accent-glow)', borderRadius: 4, pointerEvents: 'none', zIndex: 500 }} />

            {/* Center guides — visible while dragging */}
            {dragInfo && (() => {
              const SNAP   = 0.012;
              const snapX  = Math.abs(dragInfo.elCX - 0.5) < SNAP;
              const snapY  = Math.abs(dragInfo.elCY - 0.5) < SNAP;
              const pageC  = 'rgba(139,92,246,.85)';  // violet — page center
              const snapC  = 'rgba(34,197,94,1)';     // green  — snapped
              const elC    = 'rgba(251,146,60,1)';    // orange — element center

              // A line that's solid when snapping, dashed otherwise, with a glow
              function guideLine(dir, pos, color, snapped) {
                const isV = dir === 'v';
                const size = snapped ? 2 : 1.5;
                const dash = snapped
                  ? 'none'
                  : `repeating-linear-gradient(${isV ? 'to bottom' : 'to right'}, ${color} 0, ${color} 8px, transparent 8px, transparent 16px)`;
                return <div key={`${dir}${pos}`} style={{
                  position: 'absolute',
                  ...(isV
                    ? { left: pos+'%', top: 0, bottom: 0, width: size, transform: 'translateX(-50%)' }
                    : { top: pos+'%', left: 0, right: 0, height: size, transform: 'translateY(-50%)' }),
                  pointerEvents: 'none', zIndex: 600,
                  background: snapped ? color : 'transparent',
                  backgroundImage: snapped ? 'none' : dash,
                  filter: `drop-shadow(0 0 ${snapped ? 4 : 2}px ${color})`,
                }} />;
              }

              function dot(cx, cy, color, size = 10, glow = false) {
                return <div key={`dot${cx}${cy}`} style={{
                  position: 'absolute', left: cx+'%', top: cy+'%',
                  transform: 'translate(-50%,-50%)',
                  width: size, height: size, borderRadius: '50%',
                  background: color, pointerEvents: 'none', zIndex: 602,
                  boxShadow: `0 0 0 2.5px #fff, 0 0 ${glow ? 10 : 4}px ${color}`,
                }} />;
              }

              return <>
                {/* Page center guides */}
                {guideLine('v', 50, snapX ? snapC : pageC, snapX)}
                {guideLine('h', 50, snapY ? snapC : pageC, snapY)}
                {dot(50, 50, snapX && snapY ? snapC : pageC, 11, snapX && snapY)}

                {/* Element center guides (only when not snapped — avoids overlap) */}
                {!snapX && guideLine('v', dragInfo.elCX * 100, elC, false)}
                {!snapY && guideLine('h', dragInfo.elCY * 100, elC, false)}
                {dot(dragInfo.elCX * 100, dragInfo.elCY * 100, snapX && snapY ? snapC : elC, 8, false)}

                {/* "CENTER" badge — pops in when snapped to page center */}
                {(snapX || snapY) && (
                  <div style={{
                    position: 'absolute',
                    left: snapX ? '50%' : (dragInfo.elCX * 100) + '%',
                    top:  snapY ? '50%' : (dragInfo.elCY * 100) + '%',
                    transform: 'translate(-50%, -22px)',
                    background: snapC, color: '#fff',
                    fontSize: 9, fontWeight: 800, letterSpacing: 1,
                    padding: '2px 7px', borderRadius: 4,
                    pointerEvents: 'none', zIndex: 603,
                    boxShadow: `0 0 8px ${snapC}`,
                  }}>CENTER</div>
                )}
              </>;
            })()}

            {/* Elements */}
            {pageEls.map(el => (
              <CanvasElement
                key={el.id}
                el={el}
                selected={selectedIds.has(el.id)}
                isEditing={el.id === editingId}
                onSelect={(additive) => {
                  if (additive) {
                    setSelectedIds(prev => {
                      const n = new Set(prev);
                      if (n.has(el.id)) n.delete(el.id); else n.add(el.id);
                      return n;
                    });
                  } else {
                    setSelectedIds(new Set([el.id]));
                    setEditingId(null);
                  }
                }}
                onStartEdit={() => { setSelectedIds(new Set([el.id])); setEditingId(el.id); }}
                onStopEdit={() => setEditingId(null)}
                onChange={changes => { pushUndo(activePage.id, 'Move'); updateEl(el.id, changes); }}
                onToast={showToast}
                onUpload={uploadMedia}
                onDragMove={info => setDragInfo(info)}
                onDragEnd={() => setDragInfo(null)}
              />
            ))}
          </div>

          {/* Zoom controls */}
          <div style={{
            position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 2,
            background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(8px)',
            border: '1px solid var(--border)', borderRadius: 8, padding: 3,
          }}>
            <ZoomBtn onClick={() => setZoom(z => Math.max(40, z - 10))}>−</ZoomBtn>
            <span style={{ fontSize: 11, color: 'var(--muted)', padding: '0 8px' }}>{zoom}%</span>
            <ZoomBtn onClick={() => setZoom(z => Math.min(200, z + 10))}>+</ZoomBtn>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Layers + Props ── */}
        <div style={{
          width: 260, background: 'var(--surface)', borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          {/* Always-visible layers panel */}
          <LayersPanel
            elements={activePage ? (elements[activePage.id] || []) : []}
            selectedIds={selectedIds}
            onDeleteSelected={deleteSelectedEls}
            onSelect={(id, additive) => {
              if (additive) {
                setSelectedIds(prev => {
                  const n = new Set(prev);
                  if (n.has(id)) n.delete(id); else n.add(id);
                  return n;
                });
              } else {
                setSelectedIds(new Set([id]));
              }
              setEditingId(null);
            }}
          />
          {/* Scrollable props area */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
          {selectedEls.length > 1 ? (
            <MultiSelectPanel
              count={selectedEls.length}
              selectedEls={selectedEls}
              onDelete={deleteSelectedEls}
              onCopy={copyEls}
              onAlignEls={aligned => {
                const pageId = activePage.id;
                const map = Object.fromEntries(aligned.map(e => [e.id, e]));
                updateElements(pageId, (elements[pageId] || []).map(e => map[e.id] || e));
              }}
            />
          ) : selectedEl ? (
            <PropsPanel
              el={selectedEl}
              onChange={changes => updateEl(selectedEl.id, changes)}
              onDelete={() => deleteEl(selectedEl.id)}
              onDuplicate={() => duplicateEl(selectedEl.id)}
              onCopy={copyEls}
              showToast={showToast}
              onUpload={uploadMedia}
              customFonts={customFonts}
              onFontUpload={async file => {
                const form = new FormData();
                form.append('file', file);
                try {
                  const font = await api.upload('/fonts', form);
                  loadCustomFont(font.family, font.url);
                  setCustomFonts(prev => [...prev, font].sort((a, b) => a.family.localeCompare(b.family)));
                  return font;
                } catch (err) {
                  showToast('Font upload failed: ' + err.message);
                  throw err;
                }
              }}
            />
          ) : (
            <PageBackgroundPanel
              elements={pageEls}
              onSetBackground={setPageBackground}
              showToast={showToast}
            />
          )}
          </div>
        </div>
      </div>

      {/* Drag ghost */}
      <div ref={ghostRef} style={{
        position: 'fixed', pointerEvents: 'none', zIndex: 9999,
        background: 'var(--surface2)', border: '1.5px solid var(--accent)',
        borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text)',
        display: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.5)',
      }} />

      {/* Toast */}
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>

      {/* Page context menu */}
      {pageContextMenu && (
        <PageContextMenu
          menu={pageContextMenu}
          onClose={() => setPageContextMenu(null)}
          onAction={action => {
            const { pageIds } = pageContextMenu;
            const refPageId = pageIds[0];
            if (action === 'addBelow')   addPageAt('after',  refPageId);
            if (action === 'addBefore')  addPageAt('before', refPageId);
            if (action === 'duplicate')  duplicatePage(refPageId);
            if (action === 'delete')     deletePages(pageIds);
          }}
        />
      )}

      <style>{`
        .drop-target { outline: 2px dashed var(--accent) !important; }
        .el-selected { border: 1.5px solid var(--accent) !important; box-shadow: 0 0 0 1px var(--accent), 0 0 20px var(--accent-glow) !important; }
        .el-handle { position:absolute; width:10px; height:10px; background:#fff; border:1.5px solid var(--accent); border-radius:2px; z-index:10; }
        .el-handle.tl{top:3px;left:3px;cursor:nw-resize}
        .el-handle.tr{top:3px;right:3px;cursor:ne-resize}
        .el-handle.bl{bottom:3px;left:3px;cursor:sw-resize}
        .el-handle.br{bottom:3px;right:3px;cursor:se-resize}
      `}</style>
    </div>
  );
}

// ── Curve Text helpers ────────────────────────────────────────────────────────
function defaultCurvePts() {
  return [
    { x: 0.05, y: 0.70 },  // p0 anchor start
    { x: 0.30, y: 0.10 },  // p1 control 1
    { x: 0.70, y: 0.10 },  // p2 control 2
    { x: 0.95, y: 0.70 },  // p3 anchor end
  ];
}

// Renders the SVG curved text. Uses ResizeObserver so font-size stays
// in real pixels regardless of element dimensions.
function CurveTextRenderer({ el }) {
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
  const pts = p.pts || defaultCurvePts();
  const [p0, p1, p2, p3] = pts;

  function buildD(W, H) {
    if (p.side === 'below') {
      return `M ${p3.x*W} ${p3.y*H} C ${p2.x*W} ${p2.y*H} ${p1.x*W} ${p1.y*H} ${p0.x*W} ${p0.y*H}`;
    }
    return `M ${p0.x*W} ${p0.y*H} C ${p1.x*W} ${p1.y*H} ${p2.x*W} ${p2.y*H} ${p3.x*W} ${p3.y*H}`;
  }

  const pathId = `ct-${el.id}`;

  return (
    <div ref={wrapRef} style={{ position:'absolute', inset:0, overflow:'visible', pointerEvents:'none' }}>
      {dims && (() => {
        const { width: W, height: H } = dims;
        const d = buildD(W, H);
        const txt = p.text || '';
        return (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
            style={{ position:'absolute', inset:0, overflow:'visible' }}
          >
            <defs>
              <path id={pathId} d={d} />
            </defs>
            {p.showPath !== false && (
              <path d={d} fill="none"
                stroke={p.pathColor || 'rgba(108,99,255,0.45)'}
                strokeWidth={1.5}
                strokeDasharray="5 3"
              />
            )}
            {txt ? (
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
            ) : (
              <text fontFamily="'Inter', sans-serif" fontSize={p.fontSize||20} fill="rgba(0,0,0,0.22)" fontStyle="italic">
                <textPath href={`#${pathId}`} startOffset="3%">Curve Text</textPath>
              </text>
            )}
          </svg>
        );
      })()}
    </div>
  );
}

// Draggable control-point handles shown when element is in edit mode.
// Square handles = anchor points (p0, p3). Round handles = control points (p1, p2).
function CurveTextEditHandles({ el, onChange, onStopEdit, elDivRef }) {
  const p   = el.props || {};
  const pts = p.pts || defaultCurvePts();

  function startHandleDrag(e, idx) {
    e.stopPropagation();
    e.preventDefault();
    const div = elDivRef.current;
    if (!div) return;
    const currentPts = (el.props?.pts || defaultCurvePts()).slice();

    function onMove(ev) {
      const r  = div.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (ev.clientX - r.left)  / r.width));
      const ny = Math.max(0, Math.min(1, (ev.clientY - r.top)   / r.height));
      const newPts = currentPts.map((pt, i) => i === idx ? { x: nx, y: ny } : pt);
      currentPts[idx] = { x: nx, y: ny };
      onChange({ props: { ...(el.props || {}), pts: newPts } });
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  const isAnchor = [true, false, false, true];
  const colors   = ['#6c63ff', '#f97316', '#f97316', '#6c63ff'];

  return (
    <div style={{ position:'absolute', inset:0, zIndex:25, pointerEvents:'none' }}>
      {/* Tangent arm guide lines */}
      <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', overflow:'visible', pointerEvents:'none' }}>
        <line
          x1={`${pts[0].x*100}%`} y1={`${pts[0].y*100}%`}
          x2={`${pts[1].x*100}%`} y2={`${pts[1].y*100}%`}
          stroke="#f97316" strokeWidth="1" strokeDasharray="3 2" opacity="0.5"
        />
        <line
          x1={`${pts[3].x*100}%`} y1={`${pts[3].y*100}%`}
          x2={`${pts[2].x*100}%`} y2={`${pts[2].y*100}%`}
          stroke="#f97316" strokeWidth="1" strokeDasharray="3 2" opacity="0.5"
        />
      </svg>
      {/* Handle dots */}
      {pts.map((pt, idx) => (
        <div
          key={idx}
          title={['Anchor start','Control 1','Control 2','Anchor end'][idx]}
          onPointerDown={e => startHandleDrag(e, idx)}
          style={{
            position:'absolute',
            left: `${pt.x*100}%`,
            top:  `${pt.y*100}%`,
            transform:'translate(-50%,-50%)',
            width:  isAnchor[idx] ? 13 : 10,
            height: isAnchor[idx] ? 13 : 10,
            borderRadius: isAnchor[idx] ? 3 : '50%',
            background: colors[idx],
            border:'2px solid #fff',
            boxShadow:'0 1px 5px rgba(0,0,0,.45)',
            cursor:'grab',
            zIndex:30,
            pointerEvents:'all',
          }}
        />
      ))}
    </div>
  );
}

// ── Canvas element ────────────────────────────────────────────────────────────
function LinkEditOverlay({ p, onChange, onStopEdit }) {
  const [url,   setUrl]   = useState(p.url   || '');
  const [label, setLabel] = useState(p.label || '');

  function save() {
    onChange({ props: { ...p, url, label } });
    onStopEdit?.();
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { onStopEdit?.(); }
  }

  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(10,10,20,.92)', display: 'flex', flexDirection: 'column', gap: 6, padding: 8, boxSizing: 'border-box' }}
      onPointerDown={e => e.stopPropagation()}
    >
      <input autoFocus placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={onKeyDown}
        style={{ fontSize: 11, padding: '5px 7px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }}
      />
      <input placeholder="Link label" value={label} onChange={e => setLabel(e.target.value)} onKeyDown={onKeyDown}
        style={{ fontSize: 11, padding: '5px 7px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: 5 }}>
        <button onClick={save} style={{ flex: 1, fontSize: 10, padding: '4px 0', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>✓ Save</button>
        <button onClick={onStopEdit} style={{ flex: 1, fontSize: 10, padding: '4px 0', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}

function CanvasElement({ el, selected, isEditing, onSelect, onStartEdit, onStopEdit, onChange, onToast, onUpload, onDragMove, onDragEnd }) {
  const divRef = useRef(null);
  const fileInputRef = useRef(null);
  const THRESHOLD = 4;

  // ── Inline text editing state ────────────────────────────────────────────────
  // Controlled so we always know the latest value even if onBlur doesn't fire.
  const [editingText, setEditingText] = useState('');
  const editingTextRef = useRef('');
  const pRef          = useRef(el.props || {});
  const onChangeRef   = useRef(onChange);
  const wasTextEditingRef = useRef(false);
  editingTextRef.current = editingText;
  pRef.current           = el.props || {};
  onChangeRef.current    = onChange;

  const isTextEditing = isEditing && el.type === 'text';

  // When entering edit mode: load current content.
  // When exiting: save (safety net for when onBlur doesn't fire because the
  // textarea was unmounted synchronously by another element's onSelect).
  useEffect(() => {
    if (isTextEditing && !wasTextEditingRef.current) {
      setEditingText(pRef.current.content || '');
    } else if (!isTextEditing && wasTextEditingRef.current) {
      onChangeRef.current({ props: { ...pRef.current, content: editingTextRef.current } });
    }
    wasTextEditingRef.current = isTextEditing;
  }, [isTextEditing]);

  const UPLOAD_ACCEPT = {
    image: 'image/jpeg,image/png,image/webp,image/avif',
    gif:   'image/gif',
    video: 'video/mp4,video/webm,video/quicktime',
    audio: 'audio/mpeg,audio/ogg,audio/wav,audio/aac',
    sfx:   'audio/mpeg,audio/ogg,audio/wav,audio/aac',
  };
  const acceptType   = UPLOAD_ACCEPT[el.type];
  const isUploadable = !!acceptType;

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    // Show immediately with a blob URL while uploading
    const blobUrl = URL.createObjectURL(file);
    onChange({ props: { ...(el.props || {}), src: blobUrl, fileName: file.name } });
    if (onToast) onToast('Uploading ' + file.name + '…');
    try {
      const url = await onUpload(file);
      onChange({ props: { ...(el.props || {}), src: url, fileName: file.name } });
      if (onToast) onToast('✓ ' + file.name + ' saved');
    } catch (err) {
      if (onToast) onToast('Upload failed: ' + (err.message || 'Unknown error'));
    }
  }

  function startDrag(e) {
    if (isEditing) return;
    if (e.target.classList.contains('el-handle')) return;
    e.stopPropagation();
    onSelect(e.shiftKey);
    const div = divRef.current;
    const canvas = div.closest('[data-canvas]') || div.parentElement;
    const canvasR = canvas.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const origStart = { col_start: el.col_start, row_start: el.row_start };
    let dragging = false;

    div.setPointerCapture(e.pointerId);

    function onMove(ev) {
      const dx = (ev.clientX - startX) / canvasR.width;
      const dy = (ev.clientY - startY) / canvasR.height;
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return;
        dragging = true;
        div.style.opacity = '.8';
      }
      const newCS = Math.min(1 - el.col_span, Math.max(0, origStart.col_start + dx));
      const newRS = Math.min(1 - el.row_span, Math.max(0, origStart.row_start + dy));
      onChange({ col_start: newCS, row_start: newRS });
      onDragMove?.({ elCX: newCS + el.col_span / 2, elCY: newRS + el.row_span / 2 });
    }

    function onUp() {
      div.style.opacity = '';
      if (dragging) onDragEnd?.();
      div.removeEventListener('pointermove', onMove);
      div.removeEventListener('pointerup', onUp);
    }

    div.addEventListener('pointermove', onMove);
    div.addEventListener('pointerup', onUp);
  }

  function startResize(e, corner) {
    e.stopPropagation();
    const div = divRef.current;
    const canvas = div.parentElement;
    const canvasR = canvas.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const orig = { col_start: el.col_start, row_start: el.row_start, col_span: el.col_span, row_span: el.row_span };
    const MIN  = 0.05;
    // Images snap to full page when both dimensions exceed this fraction.
    // Disable snap when the image already starts at full size so the user can drag it smaller.
    const SNAP = 0.82;
    const alreadyFull = orig.col_span >= SNAP && orig.row_span >= SNAP;
    const canSnap = (el.type === 'image' || el.type === 'gif') && !alreadyFull;
    let inSnapZone = false;

    div.setPointerCapture(e.pointerId);

    function onMove(ev) {
      const dx = (ev.clientX - startX) / canvasR.width;
      const dy = (ev.clientY - startY) / canvasR.height;
      let cs = orig.col_start, rs = orig.row_start, csp = orig.col_span, rsp = orig.row_span;

      if (corner === 'br') { csp = Math.max(MIN, orig.col_span + dx); rsp = Math.max(MIN, orig.row_span + dy); }
      else if (corner === 'bl') { const nw = Math.max(MIN, orig.col_span - dx); cs = orig.col_start + (orig.col_span - nw); csp = nw; rsp = Math.max(MIN, orig.row_span + dy); }
      else if (corner === 'tr') { csp = Math.max(MIN, orig.col_span + dx); const nh = Math.max(MIN, orig.row_span - dy); rs = orig.row_start + (orig.row_span - nh); rsp = nh; }
      else if (corner === 'tl') { const nw = Math.max(MIN, orig.col_span - dx); const nh = Math.max(MIN, orig.row_span - dy); cs = orig.col_start + (orig.col_span - nw); rs = orig.row_start + (orig.row_span - nh); csp = nw; rsp = nh; }

      // Clamp to canvas bounds
      csp = Math.min(csp, 1 - Math.max(0, cs));
      rsp = Math.min(rsp, 1 - Math.max(0, rs));
      cs  = Math.max(0, Math.min(1 - csp, cs));
      rs  = Math.max(0, Math.min(1 - rsp, rs));

      // Snap to full page
      if (canSnap && csp >= SNAP && rsp >= SNAP) {
        cs = 0; rs = 0; csp = 1; rsp = 1;
        if (!inSnapZone) {
          inSnapZone = true;
          div.style.boxShadow = '0 0 0 3px #22c55e, 0 0 24px rgba(34,197,94,.5)';
        }
      } else {
        if (inSnapZone) {
          inSnapZone = false;
          div.style.boxShadow = '';
        }
      }

      onChange({ col_start: cs, row_start: rs, col_span: csp, row_span: rsp });
    }

    function onUp() {
      div.style.boxShadow = '';
      div.removeEventListener('pointermove', onMove);
      div.removeEventListener('pointerup', onUp);
      if (inSnapZone && onToast) onToast('⛶ Image filled the page');
    }

    div.addEventListener('pointermove', onMove);
    div.addEventListener('pointerup', onUp);
  }

  const style = {
    ...elStyle(el),
    border: '1.5px solid transparent',
    borderRadius: 3, cursor: 'move', userSelect: 'none', overflow: 'hidden',
  };
  if (selected) { style.borderColor = 'var(--accent)'; style.boxShadow = '0 0 0 1px var(--accent), 0 0 20px var(--accent-glow)'; }

  const p = el.props || {};

  function handleDoubleClick(e) {
    e.stopPropagation();
    if (el.type === 'text' || el.type === 'link' || el.type === 'curvetext') {
      onStartEdit?.();
    } else if (isUploadable) {
      onSelect();
      fileInputRef.current?.click();
    }
  }

  // Text / curvetext elements: show a small edit button when selected so the user
  // has a clear click target that won't accidentally trigger during a drag attempt.
  const isTextEl = el.type === 'text' || el.type === 'curvetext';

  return (
    <div ref={divRef} style={style} onPointerDown={startDrag}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'rgba(108,99,255,.5)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'transparent'; }}
    >
      {/* Hide rendered text while editing so textarea text doesn't double up */}
      {!isTextEditing && <ElementContent el={el} />}

      {/* Edit-text button — visible when text element is selected but not yet editing.
          Lets the user enter edit mode without ambiguity about drag vs edit. */}
      {isTextEl && selected && !isEditing && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onStartEdit?.(); }}
          title="Edit text (or double-click)"
          style={{
            position: 'absolute', top: 4, right: 4, zIndex: 30,
            padding: '2px 6px', fontSize: 11, lineHeight: 1.4,
            background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 4, cursor: 'pointer',
            opacity: 0.92, fontWeight: 600, letterSpacing: 0.3,
          }}
        >✎</button>
      )}

      {/* Inline text editor — transparent/in-place */}
      {isTextEditing && (
        <textarea
          autoFocus
          value={editingText}
          onChange={e => setEditingText(e.target.value)}
          onBlur={() => {
            // Save via ref so we always have the latest value regardless of closure age
            onChangeRef.current({ props: { ...pRef.current, content: editingTextRef.current } });
            onStopEdit?.();
          }}
          onKeyDown={e => {
            e.stopPropagation(); // prevent canvas shortcuts while typing
            if (e.key === 'Escape') {
              onChangeRef.current({ props: { ...pRef.current, content: editingTextRef.current } });
              onStopEdit?.();
            }
          }}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'transparent',
            border: '2px solid var(--accent)', outline: 'none', resize: 'none',
            padding: '6px 8px', boxSizing: 'border-box',
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
            caretColor: p.color || '#222',
          }}
        />
      )}

      {/* Inline link editor */}
      {isEditing && el.type === 'link' && (
        <LinkEditOverlay p={p} onChange={onChange} onStopEdit={onStopEdit} />
      )}

      {/* Curve text handle editor */}
      {isEditing && el.type === 'curvetext' && (
        <CurveTextEditHandles
          el={el}
          onChange={onChange}
          onStopEdit={onStopEdit}
          elDivRef={divRef}
        />
      )}

      {/* Hidden file input — opened on double-click */}
      {isUploadable && (
        <input ref={fileInputRef} type="file" accept={acceptType} style={{ display: 'none' }} onChange={handleFileSelect} />
      )}

      {selected && (
        <>
          {['tl','tr','bl','br'].map(pos => (
            <div key={pos} className={`el-handle ${pos}`} onPointerDown={e => startResize(e, pos)} />
          ))}
          <div style={{ position:'absolute', top:-18, left:0, background:'var(--accent)', color:'#fff', fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:'3px 3px 0 0', textTransform:'uppercase', letterSpacing:.5 }}>
            {LAYER_NAMES[el.layer]}
          </div>
        </>
      )}
    </div>
  );
}

function ElementContent({ el }) {
  const p = el.props || {};
  const type = el.type;

  if (type === 'bg') return (
    <div style={{ width:'100%', height:'100%', background: p.color ? p.color : 'linear-gradient(135deg,#1e293b,#0f172a)' }} />
  );

  if (type === 'image' || type === 'gif') {
    const fit = p.fit || 'cover';
    return p.src
      ? <img src={p.src} style={{ width:'100%', height:'100%', objectFit: fit, display:'block' }} alt={p.altText || ''} />
      : <div style={{ width:'100%', height:'100%', background:'linear-gradient(135deg,#065f46,#064e3b)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, color:'rgba(255,255,255,.5)', pointerEvents:'none' }}>
          <div style={{ fontSize:26 }}>{type === 'gif' ? 'GIF' : '🖼'}</div>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,.7)' }}>Double-click to upload</div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,.35)' }}>{type === 'gif' ? 'GIF' : 'JPEG · PNG · WebP'}</div>
        </div>;
  }

  if (type === 'text') {
    const txt = p.content || '';
    if (!txt) return (
      <div style={{ width:'100%', height:'100%', padding:'8px 10px', display:'flex', flexDirection:'column', gap:5, justifyContent:'center' }}>
        {['85%','100%','70%'].map((w,i) => <div key={i} style={{ height:8, background:'#1e1e2e', borderRadius:2, width:w }} />)}
      </div>
    );
    return (
      <div style={{
        width:'100%', height:'100%', padding:'8px 10px', overflow:'hidden',
        fontFamily: `'${p.fontFamily||'Inter'}',sans-serif`,
        fontSize: (p.fontSize||18) + 'px',
        color: p.color || '#222',
        textAlign: p.align || 'left',
        fontWeight: p.bold ? 'bold' : 'normal',
        fontStyle: p.italic ? 'italic' : 'normal',
        textDecoration: p.underline ? 'underline' : 'none',
        lineHeight: p.lineHeight || 1.4,
        letterSpacing: (p.letterSpacing||0) + 'px',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        boxSizing: 'border-box',
      }}>
        {txt}
      </div>
    );
  }

  if (type === 'video') return p.src
    ? <video src={p.src} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} muted loop autoPlay />
    : <div style={{ width:'100%', height:'100%', background:'linear-gradient(135deg,#1e1e3f,#12122a)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, pointerEvents:'none' }}>
        <div style={{ fontSize:28, color:'rgba(255,255,255,.3)' }}>▶</div>
        <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,.5)' }}>Double-click to upload</div>
        <div style={{ fontSize:10, color:'rgba(255,255,255,.25)' }}>MP4 · WebM · MOV</div>
      </div>;

  if (type === 'audio') return p.src
    ? <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(14,165,233,.1)', fontSize:11, color:'#38bdf8', fontWeight:600, gap:6 }}>
        ♪ {p.fileName || 'Audio'}
      </div>
    : <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, background:'rgba(14,165,233,.08)', pointerEvents:'none' }}>
        <div style={{ fontSize:24, color:'rgba(14,165,233,.5)' }}>♪</div>
        <div style={{ fontSize:11, fontWeight:700, color:'rgba(14,165,233,.8)' }}>Double-click to upload</div>
        <div style={{ fontSize:10, color:'rgba(255,255,255,.3)' }}>MP3 · AAC · OGG · WAV</div>
      </div>;

  if (type === 'sfx') return p.src
    ? <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(168,85,247,.1)', fontSize:11, color:'#c084fc', fontWeight:600, gap:6 }}>
        ✨ {p.fileName || 'Sound Effect'} <span style={{ opacity:.6 }}>vol {Math.round((p.volume ?? 0.3) * 100)}%</span>
      </div>
    : <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, background:'rgba(168,85,247,.08)', pointerEvents:'none' }}>
        <div style={{ fontSize:24, color:'rgba(168,85,247,.5)' }}>✨</div>
        <div style={{ fontSize:11, fontWeight:700, color:'rgba(168,85,247,.8)' }}>Double-click to upload</div>
        <div style={{ fontSize:10, color:'rgba(255,255,255,.3)' }}>MP3 · AAC · OGG · WAV</div>
      </div>;

  if (type === 'link') return (
    <div style={{ width:'100%', height:'100%', background:'rgba(168,85,247,.15)', border:'1px solid rgba(168,85,247,.3)', borderRadius:3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'#a78bfa' }}>
      🔗 {p.label || 'Visit Page'}
    </div>
  );

  if (type === 'curvetext') return <CurveTextRenderer el={el} />;

  return null;
}

// ── Page context menu ─────────────────────────────────────────────────────────
function PageContextMenu({ menu, onClose, onAction }) {
  const ref = useRef(null);
  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [onClose]);

  const multi = menu.pageIds.length > 1;
  const items = [
    { label: 'Add Page before', action: 'addBefore', disabled: multi },
    { label: 'Add Page after',  action: 'addBelow',  disabled: multi },
    { label: 'Duplicate Page',  action: 'duplicate', disabled: multi },
    null,
    { label: multi ? `Delete ${menu.pageIds.length} Pages` : 'Delete Page', action: 'delete', danger: true },
  ];

  return (
    <div ref={ref} style={{
      position: 'fixed', zIndex: 9999,
      left: menu.x, top: menu.y,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '4px 0',
      boxShadow: '0 8px 28px rgba(0,0,0,.55)',
      minWidth: 180, fontSize: 12,
    }}>
      {items.map((item, i) => item ? (
        <div key={i}
          onMouseDown={e => { e.preventDefault(); if (!item.disabled) { onAction(item.action); onClose(); } }}
          style={{
            padding: '7px 14px', cursor: item.disabled ? 'default' : 'pointer',
            color: item.danger ? '#f87171' : item.disabled ? 'var(--muted)' : 'var(--text)',
            opacity: item.disabled ? 0.45 : 1,
          }}
          onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = 'rgba(255,255,255,.06)'; }}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >{item.label}</div>
      ) : (
        <div key={i} style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
      ))}
    </div>
  );
}

// ── Layers panel ─────────────────────────────────────────────────────────────
const TYPE_ICON = { bg:'🎨', image:'🖼', gif:'🎞', video:'🎬', text:'T', link:'🔗', audio:'🎵', sfx:'✨', curvetext:'∿' };

function LayersPanel({ elements, selectedIds, onSelect, onDeleteSelected }) {
  // Render layers highest-first (visually on top → on bottom)
  const layerOrder = [5, 4, 3, 2, 1];

  return (
    <div style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <div style={{ padding: '8px 10px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--muted)', flex: 1 }}>Layers</span>
        {selectedIds.size > 1 && (
          <button
            onClick={onDeleteSelected}
            style={{ fontSize: 9, padding: '2px 7px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 4, color: '#f87171', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >🗑 Delete {selectedIds.size}</button>
        )}
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {layerOrder.map(layer => {
          const els = elements.filter(e => e.layer === layer);
          if (!els.length) return null;
          return (
            <div key={layer}>
              {/* Layer header */}
              <div style={{
                padding: '3px 10px', fontSize: 9, fontWeight: 700, letterSpacing: .5,
                textTransform: 'uppercase', color: 'var(--muted)', background: 'var(--surface2)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ opacity: .5 }}>#{layer}</span>
                <span>{LAYER_NAMES[layer]}</span>
              </div>
              {/* Elements in this layer */}
              {els.map(el => {
                const p = el.props || {};
                let label = '';
                if (el.type === 'text')           label = (p.content || 'Text box').slice(0, 26);
                else if (el.type === 'curvetext') label = (p.text || 'Curve Text').slice(0, 26);
                else if (el.type === 'link')      label = p.label || p.url || 'Link';
                else if (el.type === 'bg')        label = 'Background fill';
                else label = (el.type.charAt(0).toUpperCase() + el.type.slice(1)) + (p.src ? '' : ' (empty)');

                const isSel = selectedIds.has(el.id);
                return (
                  <div
                    key={el.id}
                    onClick={e => onSelect(el.id, e.shiftKey)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '5px 10px 5px 18px',
                      background: isSel ? 'rgba(99,102,241,.18)' : 'transparent',
                      borderLeft: `2px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                      cursor: 'pointer', fontSize: 11,
                      color: isSel ? 'var(--text)' : 'var(--muted)',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,.04)'; }}
                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: 12, width: 16, textAlign: 'center', flexShrink: 0 }}>{TYPE_ICON[el.type] || '◻'}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {isSel && <span style={{ fontSize: 8, color: 'var(--accent)', fontWeight: 700 }}>●</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
        {!elements.length && (
          <div style={{ padding: '14px 10px', fontSize: 11, color: 'var(--muted)', textAlign: 'center', opacity: .6 }}>
            No elements on this page
          </div>
        )}
      </div>
    </div>
  );
}

// ── Props panel ───────────────────────────────────────────────────────────────
function PropsPanel({ el, onChange, onDelete, onDuplicate, onCopy, showToast, onUpload, customFonts = [], onFontUpload }) {
  const typeNames = { bg:'Background', image:'Image', text:'Text', gif:'GIF', video:'Video', link:'Link', audio:'Audio', sfx:'Sound Effects', curvetext:'Curve Text' };
  const p = el.props || {};

  function setProp(key, val) { onChange({ props: { ...p, [key]: val } }); }

  async function handleMediaUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    // Show immediately with a blob URL while uploading
    const blobUrl = URL.createObjectURL(file);
    onChange({ props: { ...p, src: blobUrl, fileName: file.name, fit: p.fit || 'cover' } });
    showToast('Uploading ' + file.name + '…');
    try {
      const url = await onUpload(file);
      onChange({ props: { ...p, src: url, fileName: file.name, fit: p.fit || 'cover' } });
      showToast('✓ ' + file.name + ' saved');
    } catch (err) {
      showToast('Upload failed: ' + (err.message || 'Unknown error'));
    }
  }

  return (
    <>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: 4 }}>
          {typeNames[el.type] || el.type}
        </span>
        <span onClick={onDelete} style={{ color: 'var(--red)', cursor: 'pointer', fontSize: 16 }} title="Delete">🗑</span>
      </div>

      {/* Position & size */}
      <Section title="Position & Size">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[['X', 'col_start'], ['Y', 'row_start'], ['W', 'col_span'], ['H', 'row_span']].map(([label, key]) => (
            <div key={key}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{label} (%)</div>
              <input className="input input-sm" type="number" min={0} max={100} step={0.1}
                value={Math.round(el[key] * 1000) / 10}
                onChange={e => onChange({ [key]: parseFloat(e.target.value) / 100 || 0 })}
              />
            </div>
          ))}
        </div>
        {/* Alignment buttons */}
        {(() => {
          const btn = (title, label, onClick) => (
            <button key={title} title={title} onClick={onClick}
              style={{ flex: 1, padding: '4px 2px', fontSize: 10, fontWeight: 600,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 4, color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {label}
            </button>
          );
          return (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: .5 }}>Align to page</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                {btn('Align left',          '← Left',   () => onChange({ col_start: 0 }))}
                {btn('Center horizontally', '↔ Center', () => onChange({ col_start: (1 - el.col_span) / 2 }))}
                {btn('Align right',         'Right →',  () => onChange({ col_start: 1 - el.col_span }))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {btn('Align top',       '↑ Top',    () => onChange({ row_start: 0 }))}
                {btn('Center vertically', '↕ Middle', () => onChange({ row_start: (1 - el.row_span) / 2 }))}
                {btn('Align bottom',    '↓ Bottom', () => onChange({ row_start: 1 - el.row_span }))}
              </div>
            </div>
          );
        })()}
      </Section>

      {/* Layer */}
      <Section title="Layer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', width: 48 }}>Layer</span>
          <select className="input input-sm" style={{ flex: 1 }} value={el.layer} onChange={e => onChange({ layer: parseInt(e.target.value) })}>
            <option value={1}>1 — Background</option>
            <option value={2}>2 — Images</option>
            <option value={3}>3 — Text</option>
            <option value={4}>4 — Audio</option>
            <option value={5}>5 — Sound Effects</option>
          </select>
        </div>
      </Section>

      {/* Type-specific */}
      {el.type === 'bg' && (
        <Section title="Background Color">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <input
              type="color"
              value={p.color || '#ffffff'}
              onChange={e => setProp('color', e.target.value)}
              style={{ width: 36, height: 36, border: '1px solid var(--border)', borderRadius: 8,
                background: 'transparent', cursor: 'pointer', padding: 2, flexShrink: 0 }}
            />
            <input
              className="input input-sm"
              value={p.color || '#ffffff'}
              onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && setProp('color', e.target.value)}
              style={{ flex: 1, fontFamily: 'monospace' }}
            />
            <button
              title="Pick color from canvas with eyedropper"
              onClick={() => openEyeDropper(
                hex => setProp('color', hex),
                () => showToast('Eyedropper not supported in this browser')
              )}
              style={{ width: 36, height: 36, flexShrink: 0, border: '1px solid var(--border)',
                borderRadius: 8, background: 'var(--surface2)', cursor: 'pointer',
                fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >💧</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['#ffffff','#f8fafc','#0f172a','#1e293b','#fef9c3','#fce7f3','#eff6ff','#f0fdf4','#fdf4ff','#fff7ed'].map(c => (
              <div
                key={c}
                onClick={() => setProp('color', c)}
                title={c}
                style={{
                  width: 22, height: 22, borderRadius: 5, background: c, cursor: 'pointer',
                  border: `2px solid ${(p.color || '#ffffff') === c ? 'var(--accent)' : 'var(--border)'}`,
                  boxSizing: 'border-box', transition: 'border-color .1s',
                }}
              />
            ))}
          </div>
        </Section>
      )}

      {(el.type === 'image' || el.type === 'gif') && (
        <Section title={el.type === 'gif' ? 'GIF' : 'Image'}>
          <label style={{ display: 'block', cursor: 'pointer' }}>
            <div style={{ background: 'var(--surface2)', border: '2px dashed var(--border)', borderRadius: 8, padding: p.src ? 8 : 16, textAlign: 'center', marginBottom: 8 }}>
              {p.src
                ? <><img src={p.src} style={{ width:'100%', height:70, objectFit:'cover', borderRadius:5, marginBottom:4, display:'block' }} /><span style={{ fontSize:10, color:'var(--muted)' }}>{p.fileName}</span><br/><span style={{ fontSize:10, color:'var(--accent)' }}>Click to replace</span></>
                : <><div style={{ fontSize:22, marginBottom:4 }}>🖼</div><div style={{ fontSize:12, fontWeight:600, color:'var(--accent)' }}>Click to upload</div><div style={{ fontSize:10, color:'var(--muted)' }}>JPEG · PNG · WebP · GIF</div></>
              }
            </div>
            <input type="file" accept={el.type==='gif'?'image/gif':'image/jpeg,image/png,image/webp,image/avif'} style={{ display:'none' }} onChange={handleMediaUpload} />
          </label>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, color:'var(--muted)', width:28 }}>Fit</span>
            <select className="input input-sm" style={{ flex:1 }} value={p.fit||'cover'} onChange={e => setProp('fit', e.target.value)}>
              {['cover','contain','fill','none'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </Section>
      )}

      {el.type === 'text' && (
        <Section title="Text">
          <textarea className="input" rows={4} style={{ resize:'vertical', marginBottom:8 }}
            value={p.content||''} onChange={e => setProp('content', e.target.value)}
            placeholder="Type your text…"
          />
          <div style={{ display:'flex', gap:6, marginBottom:8 }}>
            <input className="input input-sm" type="number" value={p.fontSize||18} onChange={e => setProp('fontSize', +e.target.value)} style={{ width:60 }} title="Font size" />
            <FontSelector
              value={p.fontFamily || 'Inter'}
              onChange={f => { loadGoogleFont(f); setProp('fontFamily', f); }}
              customFonts={customFonts}
              onUploadFont={onFontUpload ? async file => {
                try {
                  const font = await onFontUpload(file);
                  if (font) { setProp('fontFamily', font.family); showToast(`✓ Font "${font.family}" uploaded`); }
                } catch {}
              } : undefined}
            />
          </div>
          <div style={{ display:'flex', gap:4, marginBottom:8 }}>
            {[['B','bold'],['I','italic'],['U','underline']].map(([label, prop]) => (
              <button key={prop} className="btn btn-ghost"
                style={{ width:32, height:28, padding:0, justifyContent:'center', background: p[prop] ? 'var(--accent)' : undefined, color: p[prop] ? '#fff' : undefined, borderColor: p[prop] ? 'var(--accent)' : undefined }}
                onClick={() => setProp(prop, !p[prop])}
              >{label}</button>
            ))}
            {['left','center','right'].map(a => (
              <button key={a} className="btn btn-ghost"
                style={{ width:32, height:28, padding:0, justifyContent:'center', background: (p.align||'left')===a ? 'var(--accent)' : undefined, color: (p.align||'left')===a ? '#fff' : undefined }}
                onClick={() => setProp('align', a)}
              >{{ left:'≡', center:'≡', right:'≡' }[a]}</button>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, color:'var(--muted)' }}>Color</span>
            <input type="color" value={p.color||'#222222'} onChange={e => setProp('color', e.target.value)}
              style={{ width:28, height:28, border:'1px solid var(--border)', borderRadius:5, background:'transparent', cursor:'pointer' }} />
            <input className="input input-sm" value={p.color||'#222222'} onChange={e => setProp('color', e.target.value)} style={{ flex:1 }} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
            <span style={{ fontSize:11, color:'var(--muted)', width:80, flexShrink:0 }}>Line height</span>
            <input type="range" min={0.8} max={3} step={0.05}
              value={p.lineHeight ?? 1.4}
              onChange={e => setProp('lineHeight', parseFloat(e.target.value))}
              style={{ flex:1 }} />
            <span style={{ fontSize:11, color:'var(--muted)', width:30, textAlign:'right' }}>
              {(p.lineHeight ?? 1.4).toFixed(2)}
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
            <span style={{ fontSize:11, color:'var(--muted)', width:80, flexShrink:0 }}>Letter spacing</span>
            <input type="range" min={-5} max={30} step={0.5}
              value={p.letterSpacing ?? 0}
              onChange={e => setProp('letterSpacing', parseFloat(e.target.value))}
              style={{ flex:1 }} />
            <span style={{ fontSize:11, color:'var(--muted)', width:30, textAlign:'right' }}>
              {p.letterSpacing ?? 0}
            </span>
          </div>
        </Section>
      )}

      {el.type === 'video' && (
        <Section title="Video">
          <label style={{ display:'block', cursor:'pointer' }}>
            <div style={{ background:'var(--surface2)', border:'2px dashed var(--border)', borderRadius:8, padding: p.src ? 8 : 16, textAlign:'center', marginBottom:8 }}>
              {p.src
                ? <><video src={p.src} style={{ width:'100%', height:70, objectFit:'cover', borderRadius:5, display:'block', marginBottom:4 }} muted /><span style={{ fontSize:10, color:'var(--accent)' }}>Click to replace</span></>
                : <><div style={{ fontSize:22, marginBottom:4 }}>▶</div><div style={{ fontSize:12, fontWeight:600, color:'var(--accent)' }}>Click to upload</div><div style={{ fontSize:10, color:'var(--muted)' }}>MP4 · WebM · MOV</div></>
              }
            </div>
            <input type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display:'none' }} onChange={handleMediaUpload} />
          </label>
        </Section>
      )}

      {el.type === 'audio' && (
        <Section title="Audio">
          <label style={{ display:'block', cursor:'pointer' }}>
            <div style={{ background:'var(--surface2)', border:'2px dashed var(--border)', borderRadius:8, padding:14, textAlign:'center', marginBottom:8 }}>
              {p.src
                ? <><audio src={p.src} controls style={{ width:'100%', marginBottom:4 }} /><span style={{ fontSize:10, color:'var(--accent)' }}>Click to replace</span></>
                : <><div style={{ fontSize:22, marginBottom:4 }}>♪</div><div style={{ fontSize:12, fontWeight:600, color:'var(--accent)' }}>Click to upload</div><div style={{ fontSize:10, color:'var(--muted)' }}>MP3 · AAC · OGG · WAV</div></>
              }
            </div>
            <input type="file" accept="audio/mpeg,audio/ogg,audio/wav,audio/aac" style={{ display:'none' }} onChange={handleMediaUpload} />
          </label>
        </Section>
      )}

      {el.type === 'sfx' && (
        <Section title="Sound Effects">
          <label style={{ display:'block', cursor:'pointer' }}>
            <div style={{ background:'var(--surface2)', border:'2px dashed var(--border)', borderRadius:8, padding:14, textAlign:'center', marginBottom:8 }}>
              {p.src
                ? <><audio src={p.src} controls style={{ width:'100%', marginBottom:4 }} /><span style={{ fontSize:10, color:'var(--accent)' }}>Click to replace</span></>
                : <><div style={{ fontSize:22, marginBottom:4 }}>✨</div><div style={{ fontSize:12, fontWeight:600, color:'var(--accent)' }}>Click to upload</div><div style={{ fontSize:10, color:'var(--muted)' }}>MP3 · AAC · OGG · WAV</div></>
              }
            </div>
            <input type="file" accept="audio/mpeg,audio/ogg,audio/wav,audio/aac" style={{ display:'none' }} onChange={handleMediaUpload} />
          </label>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, color:'var(--muted)', flexShrink:0 }}>Volume</span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={p.volume ?? 0.3}
              onChange={e => setProp('volume', parseFloat(e.target.value))}
              style={{ flex:1 }}
            />
            <span style={{ fontSize:11, color:'var(--muted)', width:32, textAlign:'right' }}>
              {Math.round((p.volume ?? 0.3) * 100)}%
            </span>
          </div>
          <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>Default is 30% — lower than Audio layer</div>
        </Section>
      )}

      {el.type === 'link' && (
        <Section title="Link">
          <input className="input" style={{ marginBottom:6 }} placeholder="https://example.com" value={p.url||''} onChange={e => setProp('url', e.target.value)} />
          <input className="input" placeholder="Link label" value={p.label||''} onChange={e => setProp('label', e.target.value)} />
        </Section>
      )}

      {el.type === 'curvetext' && (
        <>
          <Section title="Text">
            <textarea className="input" rows={3} style={{ resize:'vertical', marginBottom:8 }}
              value={p.text||''} onChange={e => setProp('text', e.target.value)}
              placeholder="Type your curved text…"
            />
            <div style={{ display:'flex', gap:6, marginBottom:8 }}>
              <input className="input input-sm" type="number" min={6} max={300}
                value={p.fontSize||20} onChange={e => setProp('fontSize', +e.target.value)}
                style={{ width:60 }} title="Font size (px)" />
              <FontSelector
                value={p.fontFamily||'Inter'}
                onChange={f => { loadGoogleFont(f); setProp('fontFamily', f); }}
                customFonts={customFonts}
                onUploadFont={onFontUpload ? async file => {
                  try {
                    const font = await onFontUpload(file);
                    if (font) { setProp('fontFamily', font.family); showToast(`✓ Font "${font.family}" uploaded`); }
                  } catch {}
                } : undefined}
              />
            </div>
            <div style={{ display:'flex', gap:4, marginBottom:8 }}>
              {[['B','bold'],['I','italic']].map(([lbl, prop]) => (
                <button key={prop} className="btn btn-ghost"
                  style={{ width:32, height:28, padding:0, justifyContent:'center', background: p[prop] ? 'var(--accent)' : undefined, color: p[prop] ? '#fff' : undefined, borderColor: p[prop] ? 'var(--accent)' : undefined }}
                  onClick={() => setProp(prop, !p[prop])}
                >{lbl}</button>
              ))}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>Color</span>
              <input type="color" value={p.color||'#222222'} onChange={e => setProp('color', e.target.value)}
                style={{ width:28, height:28, border:'1px solid var(--border)', borderRadius:5, background:'transparent', cursor:'pointer' }} />
              <input className="input input-sm" value={p.color||'#222222'} onChange={e => setProp('color', e.target.value)} style={{ flex:1 }} />
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, color:'var(--muted)', width:80, flexShrink:0 }}>Letter spacing</span>
              <input type="range" min={-5} max={30} step={0.5}
                value={p.letterSpacing||0} onChange={e => setProp('letterSpacing', parseFloat(e.target.value))}
                style={{ flex:1 }} />
              <span style={{ fontSize:11, color:'var(--muted)', width:26, textAlign:'right' }}>{p.letterSpacing||0}</span>
            </div>
          </Section>
          <Section title="Curve">
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ fontSize:11, color:'var(--muted)', width:80, flexShrink:0 }}>Text offset</span>
              <input type="range" min={0} max={100} step={1}
                value={p.startOffset!=null ? p.startOffset : 0}
                onChange={e => setProp('startOffset', parseFloat(e.target.value))}
                style={{ flex:1 }} />
              <span style={{ fontSize:11, color:'var(--muted)', width:28, textAlign:'right' }}>{p.startOffset!=null ? p.startOffset : 0}%</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ fontSize:11, color:'var(--muted)', width:80, flexShrink:0 }}>Text side</span>
              <select className="input input-sm" style={{ flex:1 }}
                value={p.side||'above'} onChange={e => setProp('side', e.target.value)}>
                <option value="above">Above curve</option>
                <option value="below">Below curve</option>
              </select>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12, color:'var(--text)' }}>
                <input type="checkbox" checked={p.showPath!==false}
                  onChange={e => setProp('showPath', e.target.checked)} />
                Show guide path
              </label>
            </div>
            {p.showPath!==false && (
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ fontSize:11, color:'var(--muted)' }}>Path color</span>
                <input type="color" value={p.pathColor||'#6c63ff'}
                  onChange={e => setProp('pathColor', e.target.value)}
                  style={{ width:28, height:28, border:'1px solid var(--border)', borderRadius:5, background:'transparent', cursor:'pointer' }} />
              </div>
            )}
            <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.5, marginBottom:8 }}>
              Double-click element to show handles. Drag <strong style={{color:'#6c63ff'}}>■ squares</strong> (anchors) and <strong style={{color:'#f97316'}}>● circles</strong> (controls) to shape the curve.
            </div>
            <button className="btn btn-ghost" style={{ width:'100%', justifyContent:'center', fontSize:11 }}
              onClick={() => setProp('pts', defaultCurvePts())}>↺ Reset curve</button>
          </Section>
        </>
      )}

      <div style={{ padding:'12px 14px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onCopy} title="Copy (⌘C)">✂ Copy</button>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onDuplicate}>⎘ Duplicate</button>
        </div>
      </div>
    </>
  );
}

// ── Font selector with Google Fonts browser + custom font upload ──────────────
function FontSelector({ value, onChange, customFonts = [], onUploadFont }) {
  const [open,           setOpen]       = useState(false);
  const [search,         setSearch]     = useState('');
  const [loaded,         setLoaded]     = useState(new Set());
  const [uploadProgress, setUploadProgress] = useState(null); // null | { done, total }
  const uploadRef = useRef(null);
  const panelRef  = useRef(null);

  const SYSTEM_FONTS = ['Inter','Georgia','Helvetica Neue','Times New Roman','Courier New'];
  const q = search.toLowerCase();

  // Custom fonts at top, then system fonts, then Google Fonts
  const filteredCustom  = customFonts.filter(f => f.family.toLowerCase().includes(q));
  const filteredSystem  = SYSTEM_FONTS.filter(f => f.toLowerCase().includes(q));
  const filteredGoogle  = GOOGLE_FONTS.filter(f => f.toLowerCase().includes(q));
  // Deduplicate: remove from Google/System if already in custom
  const customNames = new Set(customFonts.map(f => f.family));
  const finalSystem = filteredSystem.filter(f => !customNames.has(f));
  const finalGoogle = filteredGoogle.filter(f => !customNames.has(f));

  const totalCount = filteredCustom.length + finalSystem.length + finalGoogle.length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e) { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function loadPreview(family) {
    if (loaded.has(family)) return;
    setLoaded(prev => new Set([...prev, family]));
    loadGoogleFont(family);
  }

  function renderFontRow(font, key, isCustom = false, badge = null) {
    const active = font === value;
    return (
      <div
        key={key}
        onClick={() => { onChange(font); setOpen(false); setSearch(''); }}
        onMouseEnter={() => !isCustom && loadPreview(font)}
        style={{
          padding:'7px 12px', cursor:'pointer', fontSize:13,
          fontFamily: isCustom ? `'${font}', sans-serif` : (loaded.has(font) ? `'${font}', sans-serif` : 'inherit'),
          background: active ? 'var(--accent-glow)' : 'transparent',
          color: active ? 'var(--accent)' : 'var(--text)',
          borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
          transition:'background .1s',
          display:'flex', alignItems:'center', gap:6,
        }}
        onMouseOver={e => { if (!active) e.currentTarget.style.background = 'var(--surface2)'; }}
        onMouseOut={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{font}</span>
        {badge && <span style={{ fontSize:9, color:'var(--muted)', background:'var(--surface3)', padding:'1px 5px', borderRadius:3, flexShrink:0 }}>{badge}</span>}
        {active && <span style={{ fontSize:10, flexShrink:0 }}>✓</span>}
      </div>
    );
  }

  function renderSectionLabel(label) {
    return (
      <div key={`lbl-${label}`} style={{ padding:'6px 12px 2px', fontSize:9, fontWeight:700, letterSpacing:.7, textTransform:'uppercase', color:'var(--muted)' }}>
        {label}
      </div>
    );
  }

  async function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !onUploadFont) return;
    e.target.value = '';
    setOpen(false);
    setUploadProgress({ done: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      try {
        await onUploadFont(files[i]);
      } catch {} // individual failures already toasted inside onUploadFont
      setUploadProgress({ done: i + 1, total: files.length });
    }
    setUploadProgress(null);
  }

  return (
    <div ref={panelRef} style={{ position:'relative', flex:1 }}>
      {/* Hidden file input for font upload */}
      <input
        ref={uploadRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        multiple
        style={{ display:'none' }}
        onChange={handleFileChange}
      />

      {/* Trigger button */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          height:28, padding:'0 8px', borderRadius:6, border:'1px solid var(--border)',
          background:'var(--surface2)', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:6,
          fontSize:12, fontFamily:`'${value}', sans-serif`,
        }}
      >
        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {uploadProgress
            ? `Uploading ${uploadProgress.done + 1} of ${uploadProgress.total}…`
            : value}
        </span>
        <span style={{ fontSize:9, color:'var(--muted)', flexShrink:0 }}>▼</span>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position:'fixed', zIndex:9999,
          width:240, maxHeight:360, overflow:'hidden',
          background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:10, boxShadow:'0 16px 40px rgba(0,0,0,.5)',
          display:'flex', flexDirection:'column',
          top: (() => { const r = panelRef.current?.getBoundingClientRect(); return (r?.bottom || 0) + 4; })(),
          left: (() => { const r = panelRef.current?.getBoundingClientRect(); return r?.left || 0; })(),
        }}>
          {/* Search */}
          <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <input
              autoFocus
              className="input input-sm"
              style={{ width:'100%', boxSizing:'border-box' }}
              placeholder="Search fonts…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>

          {/* Font list */}
          <div style={{ overflowY:'auto', flex:1 }}>
            {totalCount === 0 && (
              <div style={{ padding:'16px', textAlign:'center', fontSize:12, color:'var(--muted)' }}>No fonts found</div>
            )}

            {/* Custom uploaded fonts */}
            {filteredCustom.length > 0 && (
              <>
                {renderSectionLabel('Your fonts')}
                {filteredCustom.map(f => renderFontRow(f.family, f.id, true, 'custom'))}
              </>
            )}

            {/* System fonts */}
            {finalSystem.length > 0 && (
              <>
                {renderSectionLabel('System')}
                {finalSystem.map(f => renderFontRow(f, f))}
              </>
            )}

            {/* Google Fonts */}
            {finalGoogle.length > 0 && (
              <>
                {renderSectionLabel('Google Fonts')}
                {finalGoogle.map(f => renderFontRow(f, f))}
              </>
            )}
          </div>

          {/* Upload button */}
          {onUploadFont && (
            <div style={{ borderTop:'1px solid var(--border)', flexShrink:0 }}>
              <div
                onClick={() => uploadRef.current?.click()}
                style={{
                  padding:'9px 12px', cursor:'pointer', fontSize:12, fontWeight:600,
                  color:'var(--accent)', display:'flex', alignItems:'center', gap:7,
                  transition:'background .1s',
                }}
                onMouseOver={e => e.currentTarget.style.background = 'var(--accent-glow)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize:14 }}>↑</span>
                Upload font files (.ttf .otf .woff .woff2)
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Multi-select panel ────────────────────────────────────────────────────────
function MultiSelectPanel({ count, selectedEls = [], onDelete, onCopy, onAlignEls }) {
  // Align all selected elements relative to each other.
  // Reference is the bounding box of the entire selection.
  function align(axis, mode) {
    if (!selectedEls.length || !onAlignEls) return;
    const sk = axis === 'h' ? 'col_start' : 'row_start';
    const ek = axis === 'h' ? 'col_span'  : 'row_span';
    const mins  = Math.min(...selectedEls.map(e => e[sk]));
    const maxes = Math.max(...selectedEls.map(e => e[sk] + e[ek]));
    const boxCenter = (mins + maxes) / 2;
    onAlignEls(selectedEls.map(e => {
      let newStart;
      if      (mode === 'start')  newStart = mins;
      else if (mode === 'center') newStart = boxCenter - e[ek] / 2;
      else                        newStart = maxes - e[ek];
      return { ...e, [sk]: newStart };
    }));
  }

  const btnStyle = {
    flex: 1, padding: '5px 2px', fontSize: 10, fontWeight: 600,
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 4, color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap',
  };

  return (
    <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        background: 'var(--accent-glow)', border: '1px solid var(--accent)', borderRadius: 8 }}>
        <span style={{ fontSize: 18 }}>⬛</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{count} elements selected</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Shift+click to add or remove</div>
        </div>
      </div>

      {/* Align relative to each other */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Align to each other</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <button style={btnStyle} title="Align left edges"         onClick={() => align('h', 'start') }>← Left</button>
          <button style={btnStyle} title="Center horizontally"      onClick={() => align('h', 'center')}>↔ Center</button>
          <button style={btnStyle} title="Align right edges"        onClick={() => align('h', 'end')   }>Right →</button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={btnStyle} title="Align top edges"          onClick={() => align('v', 'start') }>↑ Top</button>
          <button style={btnStyle} title="Center vertically"        onClick={() => align('v', 'center')}>↕ Middle</button>
          <button style={btnStyle} title="Align bottom edges"       onClick={() => align('v', 'end')   }>↓ Bottom</button>
        </div>
      </div>

      <button className="btn btn-ghost" style={{ justifyContent: 'center' }} onClick={onCopy}>
        ✂ Copy all ({count})
      </button>
      <button className="btn btn-ghost" style={{ justifyContent: 'center', color: 'var(--red)', borderColor: 'var(--red)' }} onClick={onDelete}>
        🗑 Delete all ({count})
      </button>
    </div>
  );
}

// ── Eyedropper helper (shared) ────────────────────────────────────────────────
async function openEyeDropper(onPick, onUnsupported) {
  if (!window.EyeDropper) { onUnsupported?.(); return; }
  try {
    const result = await new window.EyeDropper().open();
    onPick(result.sRGBHex);
  } catch {} // user cancelled
}

// ── Page background panel (shown when no element selected) ────────────────────
function PageBackgroundPanel({ elements, onSetBackground, showToast }) {
  const bgEl  = elements.find(e => e.type === 'bg');
  const color = bgEl?.props?.color || '#ffffff';

  return (
    <div>
      <Section title="Page Background">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <input
            type="color"
            value={color}
            onChange={e => onSetBackground(e.target.value)}
            style={{ width: 36, height: 36, border: '1px solid var(--border)', borderRadius: 8,
              background: 'transparent', cursor: 'pointer', padding: 2, flexShrink: 0 }}
          />
          <input
            className="input input-sm"
            value={color}
            onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onSetBackground(e.target.value)}
            style={{ flex: 1, fontFamily: 'monospace' }}
          />
          <button
            title="Pick color from canvas with eyedropper"
            onClick={() => openEyeDropper(
              hex => onSetBackground(hex),
              () => showToast('Eyedropper not supported in this browser')
            )}
            style={{ width: 36, height: 36, flexShrink: 0, border: '1px solid var(--border)',
              borderRadius: 8, background: 'var(--surface2)', cursor: 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >💧</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['#ffffff','#f8fafc','#0f172a','#1e293b','#fef9c3','#fce7f3','#eff6ff','#f0fdf4','#fdf4ff','#fff7ed'].map(c => (
            <div
              key={c}
              onClick={() => onSetBackground(c)}
              title={c}
              style={{
                width: 22, height: 22, borderRadius: 5, background: c, cursor: 'pointer',
                border: `2px solid ${color === c ? 'var(--accent)' : 'var(--border)'}`,
                boxSizing: 'border-box', transition: 'border-color .1s',
              }}
            />
          ))}
        </div>
      </Section>
      <div style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--muted)', textAlign: 'center' }}>
        <div style={{ fontSize: 32, opacity: .2 }}>◻</div>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>Click an element on the canvas to edit its properties</div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:.7, textTransform:'uppercase', color:'var(--muted)', marginBottom:10 }}>{title}</div>
      {children}
    </div>
  );
}

function ZoomBtn({ onClick, children }) {
  return (
    <div onClick={onClick} style={{ width:26, height:26, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:5, cursor:'pointer', color:'var(--muted)', fontSize:14, fontWeight:700 }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.07)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >{children}</div>
  );
}

// ── Canvas grid ───────────────────────────────────────────────────────────────
function CanvasGrid({ fmt }) {
  const { cols, rows, w: W, h: H } = fmt;
  const margin = 48;
  const contentW = W - margin * 2;
  const contentH = H - margin * 2;
  const gutter = 24;
  const colW = (contentW - (cols - 1) * gutter) / cols;
  const rowH = (contentH - (rows - 1) * gutter) / rows;

  return (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none' }}>
      {Array.from({ length: cols }).map((_, c) => (
        <div key={c} style={{ position:'absolute', top: margin, bottom: margin, left: margin + c * (colW + gutter), width: colW, background:'rgba(108,99,255,.05)', borderLeft:'1px solid rgba(108,99,255,.12)', borderRight:'1px solid rgba(108,99,255,.12)' }} />
      ))}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ position:'absolute', left: margin, right: margin, top: margin + r * (rowH + gutter), height: rowH, background:'rgba(108,99,255,.03)', borderTop:'1px solid rgba(108,99,255,.08)' }} />
      ))}
    </div>
  );
}
