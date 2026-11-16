// ── RichTextEditor ────────────────────────────────────────────────────────────
// Drop into: frontend/src/components/RichTextEditor.jsx
//
// A lightweight contenteditable rich-text editor with a floating format toolbar.
// Supports per-word/selection: Bold · Italic · Underline · Text color · Font family · Font size
//
// Usage inside EditorPage:
//   import RichTextEditor from '../components/RichTextEditor';
//
//   <RichTextEditor
//     html={el.props.richText || el.props.content || ''}
//     baseStyle={{
//       fontFamily: el.props.fontFamily || 'Inter',
//       fontSize:   el.props.fontSize   || 18,
//       color:      el.props.color      || '#222222',
//       textAlign:  el.props.align      || 'left',
//       lineHeight: el.props.lineHeight || 1.4,
//       letterSpacing: (el.props.letterSpacing || 0) + 'px',
//       fontWeight: el.props.bold      ? 'bold'      : 'normal',
//       fontStyle:  el.props.italic    ? 'italic'    : 'normal',
//       textDecoration: el.props.underline ? 'underline' : 'none',
//     }}
//     onChange={(html) => updateProp('richText', html)}
//   />
//
// The onChange callback receives the full innerHTML whenever the content changes.
// Store the returned html in `el.props.richText`.
// In ViewerPage, check for `p.richText` first, then fall back to `p.content`.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState, useEffect, useCallback } from 'react';

// ── Fonts & sizes available in the toolbar ────────────────────────────────────
const FONTS = [
  'Inter', 'Lexend', 'Figtree', 'Georgia', 'Times New Roman',
  'Courier New', 'Impact', 'Trebuchet MS', 'Comic Sans MS',
];
const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64, 72];

// ── Storykeeper brand colors + common swatches ────────────────────────────────
const COLOR_SWATCHES = [
  '#222222', '#ffffff', '#634D96', '#421F93', '#9B70B8',
  '#BAF7FD', '#EF9BBD', '#A0AFF1', '#EDE8F8',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6',
];

// ─────────────────────────────────────────────────────────────────────────────

export default function RichTextEditor({ html, baseStyle = {}, onChange }) {
  const editorRef = useRef(null);
  const toolbarRef = useRef(null);

  // toolbar: null | { x, y, bold, italic, underline }
  const [toolbar, setToolbar] = useState(null);
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [customColor, setCustomColor] = useState('#634D96');

  // --- sync external html into DOM (only on mount / when html changes externally)
  const lastHtmlRef = useRef('__UNSET__');
  useEffect(() => {
    if (!editorRef.current) return;
    // Only update DOM if the value genuinely changed from outside
    if (html !== lastHtmlRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html || '';
      lastHtmlRef.current = html;
    }
  }, [html]);

  // --- track selection to show/hide toolbar
  const updateToolbar = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editorRef.current) {
      setToolbar(null);
      return;
    }
    // Only show toolbar if selection is inside the editor
    const anchor = sel.anchorNode;
    if (!editorRef.current.contains(anchor)) {
      setToolbar(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect.width) { setToolbar(null); return; }

    setToolbar({
      x: rect.left + rect.width / 2,
      y: rect.top,                       // toolbar renders above: y - toolbarH
      bold:      document.queryCommandState('bold'),
      italic:    document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', updateToolbar);
    return () => document.removeEventListener('selectionchange', updateToolbar);
  }, [updateToolbar]);

  // Close menus when clicking outside
  useEffect(() => {
    function handlePointerDown(e) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        setShowFontMenu(false);
        setShowSizeMenu(false);
        setShowColorMenu(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  // ── Save selection before toolbar click (blur would clear it) ────────────────
  const savedRange = useRef(null);
  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    const sel = window.getSelection();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  }

  // ── Exec helpers ──────────────────────────────────────────────────────────────
  function execFormat(cmd, value) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value ?? null);
    notify();
    updateToolbar();
  }

  // Wrap current selection in a span with an inline style property
  function applySpanStyle(cssProp, value) {
    restoreSelection();
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.style[cssProp] = value;
    try {
      // surroundContents works when selection doesn't cross element boundaries
      range.surroundContents(span);
    } catch {
      // For complex selections spanning multiple nodes, extract + re-insert
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
    }
    // Move cursor to end of inserted span
    range.setStartAfter(span);
    range.setEndAfter(span);
    sel.removeAllRanges();
    sel.addRange(range);
    notify();
    updateToolbar();
  }

  function notify() {
    if (editorRef.current) {
      const newHtml = editorRef.current.innerHTML;
      lastHtmlRef.current = newHtml;
      onChange?.(newHtml);
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────
  function handleInput() { notify(); }

  function handleKeyDown(e) {
    // Allow Tab to insert a tab character instead of focusing next element
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '\t');
    }
  }

  // ── Toolbar button style ──────────────────────────────────────────────────────
  const tbBtn = (active) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 6,
    border: 'none', cursor: 'pointer',
    background: active ? '#421F93' : 'transparent',
    color: active ? '#fff' : '#272235',
    fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit',
    flexShrink: 0,
    transition: 'background .12s',
  });

  const TOOLBAR_H = 42;
  const TOOLBAR_W = 400; // approx

  return (
    <>
      {/* ── Editable surface ──────────────────────────────────────────────────── */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onMouseDown={() => { setShowFontMenu(false); setShowSizeMenu(false); setShowColorMenu(false); }}
        style={{
          width: '100%',
          height: '100%',
          padding: '8px 10px',
          boxSizing: 'border-box',
          outline: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflow: 'hidden',
          cursor: 'text',
          ...baseStyle,
        }}
      />

      {/* ── Floating toolbar (portal-style: fixed to viewport) ───────────────── */}
      {toolbar && (
        <div
          ref={toolbarRef}
          onMouseDown={(e) => {
            // Prevent blur on editor when clicking toolbar
            e.preventDefault();
            saveSelection();
          }}
          style={{
            position: 'fixed',
            left: Math.max(8, Math.min(toolbar.x - TOOLBAR_W / 2, window.innerWidth - TOOLBAR_W - 8)),
            top: toolbar.y - TOOLBAR_H - 8,
            zIndex: 99999,
            background: '#fff',
            border: '1px solid #E8E0F7',
            borderRadius: 10,
            boxShadow: '0 4px 20px rgba(99,77,150,.18)',
            padding: '5px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            height: TOOLBAR_H,
          }}
        >
          {/* Bold */}
          <button
            style={tbBtn(toolbar.bold)}
            title="Bold (Ctrl+B)"
            onClick={() => execFormat('bold')}
          >
            <strong>B</strong>
          </button>

          {/* Italic */}
          <button
            style={{ ...tbBtn(toolbar.italic), fontStyle: 'italic' }}
            title="Italic (Ctrl+I)"
            onClick={() => execFormat('italic')}
          >
            <em>I</em>
          </button>

          {/* Underline */}
          <button
            style={{ ...tbBtn(toolbar.underline), textDecoration: 'underline' }}
            title="Underline (Ctrl+U)"
            onClick={() => execFormat('underline')}
          >
            U
          </button>

          <Divider />

          {/* Font family picker */}
          <div style={{ position: 'relative' }}>
            <button
              style={{
                ...tbBtn(false),
                width: 'auto', padding: '0 8px',
                fontSize: 11, fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
              title="Font family"
              onClick={() => {
                saveSelection();
                setShowFontMenu(v => !v);
                setShowSizeMenu(false);
                setShowColorMenu(false);
              }}
            >
              Font ▾
            </button>
            {showFontMenu && (
              <DropMenu items={FONTS} onSelect={(f) => {
                applySpanStyle('fontFamily', `'${f}', sans-serif`);
                setShowFontMenu(false);
              }} renderItem={(f) => <span style={{ fontFamily: f }}>{f}</span>} />
            )}
          </div>

          {/* Font size picker */}
          <div style={{ position: 'relative' }}>
            <button
              style={{
                ...tbBtn(false),
                width: 'auto', padding: '0 8px',
                fontSize: 11, fontWeight: 600,
              }}
              title="Font size"
              onClick={() => {
                saveSelection();
                setShowSizeMenu(v => !v);
                setShowFontMenu(false);
                setShowColorMenu(false);
              }}
            >
              Size ▾
            </button>
            {showSizeMenu && (
              <DropMenu items={FONT_SIZES} onSelect={(sz) => {
                applySpanStyle('fontSize', sz + 'px');
                setShowSizeMenu(false);
              }} renderItem={(sz) => `${sz}px`} />
            )}
          </div>

          <Divider />

          {/* Color picker */}
          <div style={{ position: 'relative' }}>
            <button
              style={{
                ...tbBtn(false),
                width: 'auto', padding: '0 6px',
                gap: 4, fontSize: 12,
              }}
              title="Text color"
              onClick={() => {
                saveSelection();
                setShowColorMenu(v => !v);
                setShowFontMenu(false);
                setShowSizeMenu(false);
              }}
            >
              <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: customColor, border: '1px solid #ccc' }} />
              <span style={{ fontSize: 11, fontWeight: 600 }}>Color ▾</span>
            </button>

            {showColorMenu && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4,
                background: '#fff', border: '1px solid #E8E0F7', borderRadius: 10,
                padding: 10, zIndex: 99999,
                boxShadow: '0 4px 16px rgba(0,0,0,.12)',
                width: 180,
              }}>
                {/* Swatches */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                  {COLOR_SWATCHES.map(c => (
                    <button key={c} title={c} onClick={() => {
                      applySpanStyle('color', c);
                      setCustomColor(c);
                      setShowColorMenu(false);
                    }} style={{
                      width: 22, height: 22, borderRadius: 5,
                      background: c, border: '1px solid rgba(0,0,0,.12)',
                      cursor: 'pointer', flexShrink: 0,
                    }} />
                  ))}
                </div>
                {/* Custom color input */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="color" value={customColor}
                    onChange={e => setCustomColor(e.target.value)}
                    style={{ width: 32, height: 24, padding: 1, border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}
                  />
                  <input type="text" value={customColor}
                    onChange={e => setCustomColor(e.target.value)}
                    style={{ flex: 1, fontSize: 11, fontFamily: 'monospace', padding: '3px 6px', border: '1px solid #E8E0F7', borderRadius: 5, outline: 'none' }}
                  />
                  <button onClick={() => {
                    applySpanStyle('color', customColor);
                    setShowColorMenu(false);
                  }} style={{
                    background: '#634D96', color: '#fff', border: 'none', borderRadius: 5,
                    padding: '4px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  }}>
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Clear formatting */}
          <Divider />
          <button
            style={{ ...tbBtn(false), fontSize: 10, width: 'auto', padding: '0 6px' }}
            title="Clear all formatting in selection"
            onClick={() => {
              restoreSelection();
              execFormat('removeFormat');
            }}
          >
            ✕ Clear
          </button>
        </div>
      )}
    </>
  );

}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ width: 1, height: 20, background: '#E8E0F7', margin: '0 3px', flexShrink: 0 }} />;
}

function DropMenu({ items, onSelect, renderItem }) {
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, marginTop: 4,
      background: '#fff', border: '1px solid #E8E0F7', borderRadius: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,.12)',
      zIndex: 99999,
      maxHeight: 220, overflowY: 'auto',
      minWidth: 150,
    }}>
      {items.map((item, i) => (
        <div key={i}
          onClick={() => onSelect(item)}
          style={{
            padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: '#272235',
            borderBottom: i < items.length - 1 ? '1px solid #F3EFFE' : 'none',
            transition: 'background .1s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#EDE8F8'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}
