/* LuidgotDOx: Manga Maker. It has pages, panel layouts, ink tools, screentones, speed and focus lines,
   speech bubbles you can type in, a script panel, free AI panel art, and PNG/PDF export. */
(function () {
  'use strict';
  const { $, $$, store, toast, modal, download, pickFile, safeName, loadScript, onShow, registerBackup } = window.FS;

  const PW = 1000, PH = 1414, M = 46, G = 18;          // page size, outer margin, gutter
  const LX = M, LY = M, LW = PW - 2 * M, LH = PH - 2 * M; // live area
  const rid = () => Math.random().toString(36).slice(2, 10);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- panel layouts ----------
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  function rows(spec) { // spec: [[heightFrac, [colFracs...]], ...]
    const out = []; let y = LY;
    const totalGapY = G * (spec.length - 1);
    spec.forEach(([hf, cols]) => {
      const h = (LH - totalGapY) * hf; let x = LX;
      const totalGapX = G * (cols.length - 1);
      const ordered = cols.slice();
      ordered.forEach((wf) => { const w = (LW - totalGapX) * wf; out.push(rect(x, y, w, h)); x += w + G; });
      y += h + G;
    });
    return out;
  }
  function slant3() {
    const yA = (x) => LY + LH * (0.30 + 0.10 * (x - LX) / LW), yB = (x) => LY + LH * (0.70 - 0.08 * (x - LX) / LW);
    const x0 = LX, x1 = LX + LW, g = G / 2;
    return [
      [[x0, LY], [x1, LY], [x1, yA(x1) - g], [x0, yA(x0) - g]],
      [[x0, yA(x0) + g], [x1, yA(x1) + g], [x1, yB(x1) - g], [x0, yB(x0) - g]],
      [[x0, yB(x0) + g], [x1, yB(x1) + g], [x1, LY + LH], [x0, LY + LH]]
    ];
  }
  function slantSplit() {
    const y1 = LY + LH * 0.28, y2 = LY + LH * 0.72, g = G / 2;
    const xt = LX + LW * 0.62, xb = LX + LW * 0.38;
    return [
      rect(LX, LY, LW, y1 - LY - g),
      [[LX, y1 + g], [xt - g, y1 + g], [xb - g, y2 - g], [LX, y2 - g]],
      [[xt + g, y1 + g], [LX + LW, y1 + g], [LX + LW, y2 - g], [xb + g, y2 - g]],
      rect(LX, y2 + g, LW, LY + LH - y2 - g)
    ];
  }
  function tallSide() {
    const wl = (LW - G) * 0.42, wr = LW - G - wl, h = (LH - 2 * G) / 3;
    return [rect(LX, LY, wl, LH), rect(LX + wl + G, LY, wr, h), rect(LX + wl + G, LY + h + G, wr, h), rect(LX + wl + G, LY + 2 * (h + G), wr, h)];
  }
  const LAYOUTS = {
    classic5: { name: 'Classic 5', make: () => rows([[0.3, [1]], [0.35, [0.55, 0.45]], [0.35, [0.42, 0.58]]]) },
    grid4: { name: '4 grid', make: () => rows([[0.5, [0.5, 0.5]], [0.5, [0.5, 0.5]]]) },
    grid6: { name: '6 grid', make: () => rows([[1 / 3, [0.5, 0.5]], [1 / 3, [0.5, 0.5]], [1 / 3, [0.5, 0.5]]]) },
    three: { name: '3 rows', make: () => rows([[1 / 3, [1]], [1 / 3, [1]], [1 / 3, [1]]]) },
    action: { name: 'Big + 3', make: () => rows([[0.62, [1]], [0.38, [1 / 3, 1 / 3, 1 / 3]]]) },
    tall: { name: 'Tall side', make: tallSide },
    slant3: { name: 'Slanted 3', make: slant3 },
    slantSplit: { name: 'Diagonal split', make: slantSplit },
    yonkoma: { name: '4-koma strip', make: () => rows([[0.25, [1]], [0.25, [1]], [0.25, [1]], [0.25, [1]]]) },
    two: { name: '2 rows', make: () => rows([[0.5, [1]], [0.5, [1]]]) },
    splash: { name: 'Splash page', make: () => [rect(LX, LY, LW, LH)] },
    blank: { name: 'No panels', make: () => [] }
  };

  // ---------- geometry ----------
  function inPoly(x, y, pts) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function bbox(pts) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  function polyPath(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }

  // ---------- state ----------
  const P = { title: '', rtl: true, pages: [], cur: 0 };
  const T = { tool: 'select', size: 4, sel: null, panel: -1, drag: null, editing: null };
  const canvas = $('#mgCanvas'), ctx = canvas.getContext('2d');
  canvas.width = PW; canvas.height = PH;
  const page = () => P.pages[P.cur];

  function newArt() { const c = document.createElement('canvas'); c.width = PW; c.height = PH; return c; }
  function newPage(layout = 'classic5') {
    return { id: rid(), layout, panels: LAYOUTS[layout].make(), border: 4, objs: [], art: newArt() };
  }

  // ---------- screentones ----------
  const toneCache = {};
  function toneTile(kind) {
    if (toneCache[kind]) return toneCache[kind];
    const c = document.createElement('canvas'), x = c.getContext('2d');
    const dot = (cell, r) => { c.width = c.height = cell; x.fillStyle = '#000'; x.beginPath(); x.arc(cell / 2, cell / 2, r, 0, 7); x.fill(); };
    if (kind === 'dots-light') dot(8, 1.25);
    else if (kind === 'dots') dot(7, 1.9);
    else if (kind === 'dots-dark') dot(6, 2.5);
    else if (kind === 'lines' || kind === 'cross') {
      c.width = c.height = 8; x.strokeStyle = '#000'; x.lineWidth = 1.3;
      x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.moveTo(-2, 2); x.lineTo(2, -2); x.moveTo(6, 10); x.lineTo(10, 6);
      if (kind === 'cross') { x.moveTo(-2, -2); x.lineTo(10, 10); x.moveTo(6, -2); x.lineTo(10, 2); x.moveTo(-2, 6); x.lineTo(2, 10); }
      x.stroke();
    } else { c.width = c.height = 4; x.fillStyle = '#9b9b9b'; x.fillRect(0, 0, 4, 4); }
    return (toneCache[kind] = ctx.createPattern(c, 'repeat'));
  }

  // ---------- bubbles + text ----------
  function wrap(c, text, maxW) {
    const lines = [];
    String(text).split('\n').forEach((para) => {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); return; }
      let line = '';
      words.forEach((w) => {
        while (c.measureText(w).width > maxW && w.length > 1) { // break very long words
          let k = w.length - 1; while (k > 1 && c.measureText(w.slice(0, k) + '-').width > maxW) k--;
          if (line) { lines.push(line); line = ''; }
          lines.push(w.slice(0, k) + '-'); w = w.slice(k);
        }
        const t = line ? line + ' ' + w : w;
        if (c.measureText(t).width <= maxW || !line) line = t; else { lines.push(line); line = w; }
      });
      lines.push(line);
    });
    return lines;
  }
  const bubbleFont = (o, s) => o.kind === 'shout' ? `400 ${s}px Bangers, Impact, sans-serif` : `700 ${s}px "Comic Neue", "Comic Sans MS", sans-serif`;
  function innerBox(o) {
    if (o.kind === 'narration') return { w: o.w - 22, h: o.h - 16 };
    if (o.kind === 'shout') return { w: o.w * 0.6, h: o.h * 0.58 };
    return { w: o.w * 0.74, h: o.h * 0.7 };
  }
  function fitText(c, o) {
    const ib = innerBox(o), txt = o.kind === 'shout' ? String(o.text).toUpperCase() : o.text;
    let max = o.fs || Math.round(clamp(o.h * 0.28, 14, 40));
    for (let s = max; s >= 9; s--) {
      c.font = bubbleFont(o, s);
      const lines = wrap(c, txt, ib.w);
      if (lines.length * s * 1.15 <= ib.h && lines.every((l) => c.measureText(l).width <= ib.w + 0.5)) return { s, lines };
      if (o.fs && s === 9) break;
    }
    c.font = bubbleFont(o, 9); return { s: 9, lines: wrap(c, txt, ib.w) };
  }
  // seeded random so spiky/cloud bubbles keep their shape
  function seeded(str) { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; }

  function drawBubble(c, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2, rx = o.w / 2, ry = o.h / 2;
    const lw = 3;
    c.save(); c.lineJoin = 'round'; c.lineWidth = lw; c.strokeStyle = '#000'; c.fillStyle = '#fff';
    const tail = o.tail && o.kind !== 'narration' ? o.tail : null;
    const tailOut = tail && (((tail.x - cx) / rx) ** 2 + ((tail.y - cy) / ry) ** 2 > 1.05);
    if (o.kind === 'narration') {
      c.beginPath(); c.rect(o.x, o.y, o.w, o.h); c.fill(); c.stroke();
    } else if (o.kind === 'thought') {
      const rnd = seeded(o.id), n = Math.max(8, Math.round((Math.PI * (rx + ry)) / 46));
      c.beginPath();
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * Math.PI * 2, px = cx + rx * Math.cos(t), py = cy + ry * Math.sin(t);
        if (!i) { c.moveTo(px, py); continue; }
        const tm = ((i - 0.5) / n) * Math.PI * 2, k = 1.16 + rnd() * 0.1;
        c.quadraticCurveTo(cx + rx * k * Math.cos(tm), cy + ry * k * Math.sin(tm), px, py);
      }
      c.closePath(); c.fill(); c.stroke();
      if (tailOut) {
        const a = Math.atan2((tail.y - cy) / ry, (tail.x - cx) / rx), sx = cx + rx * 1.1 * Math.cos(a), sy = cy + ry * 1.1 * Math.sin(a);
        [0.25, 0.6, 1].forEach((f, i) => {
          const r = [13, 9, 6][i]; c.beginPath(); c.ellipse(sx + (tail.x - sx) * f, sy + (tail.y - sy) * f, r * 1.25, r, 0, 0, 7); c.fill(); c.stroke();
        });
      }
    } else if (o.kind === 'shout') {
      const rnd = seeded(o.id), n = Math.max(12, Math.round((rx + ry) / 9)), at = tailOut ? Math.atan2((tail.y - cy) / ry, (tail.x - cx) / rx) : null;
      let best = -1, bd = 9;
      if (at != null) for (let i = 0; i < n * 2; i += 2) { const t = (i / (n * 2)) * Math.PI * 2; const d = Math.abs(Math.atan2(Math.sin(t - at), Math.cos(t - at))); if (d < bd) { bd = d; best = i; } }
      c.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const t = (i / (n * 2)) * Math.PI * 2, k = i % 2 ? 0.8 + rnd() * 0.06 : 1.08 + rnd() * 0.14;
        const px = i === best ? tail.x : cx + rx * k * Math.cos(t), py = i === best ? tail.y : cy + ry * k * Math.sin(t);
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.closePath(); c.fill(); c.lineWidth = 3.5; c.stroke();
    } else { // speech / whisper: one outline that includes the tail
      if (o.kind === 'whisper') c.setLineDash([9, 7]);
      c.beginPath();
      if (tailOut) {
        const a = Math.atan2((tail.y - cy) / ry, (tail.x - cx) / rx), d = clamp(0.2 * 140 / Math.max(rx, ry), 0.12, 0.3);
        c.ellipse(cx, cy, rx, ry, 0, a + d, a - d + Math.PI * 2);
        const ex = cx + rx * Math.cos(a), ey = cy + ry * Math.sin(a);
        c.quadraticCurveTo((ex + tail.x) / 2 + (tail.y - ey) * 0.12, (ey + tail.y) / 2 - (tail.x - ex) * 0.12, tail.x, tail.y);
        c.closePath();
      } else c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      c.fill(); c.stroke(); c.setLineDash([]);
    }
    // text
    if (o.text) {
      const { s, lines } = fitText(c, o);
      c.font = bubbleFont(o, s); c.fillStyle = '#000'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const lh = s * 1.15, top = cy - (lines.length * lh) / 2 + lh / 2;
      lines.forEach((l, i) => c.fillText(l, cx, top + i * lh));
    }
    c.restore();
  }

  function sfxMetrics(o) { ctx.font = `400 ${o.size}px Bangers, Impact, sans-serif`; return { w: Math.max(30, ctx.measureText(o.text || ' ').width), h: o.size }; }
  function drawSfx(c, o) {
    c.save(); c.translate(o.x, o.y); c.rotate((o.rot || 0) * Math.PI / 180);
    c.font = `400 ${o.size}px Bangers, Impact, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const t = o.text || '';
    if (o.style === 'hollow') { c.lineWidth = o.size * 0.14; c.strokeStyle = '#000'; c.strokeText(t, 0, 0); c.fillStyle = '#fff'; c.fillText(t, 0, 0); }
    else { c.lineWidth = o.size * 0.2; c.strokeStyle = '#fff'; c.strokeText(t, 0, 0); c.fillStyle = '#000'; c.fillText(t, 0, 0); }
    c.restore();
  }

  // ---------- rendering ----------
  function composite(c, pg, ui) {
    c.save(); c.fillStyle = '#fff'; c.fillRect(0, 0, PW, PH);
    c.drawImage(pg.art, 0, 0);
    if (pg.border > 0) { c.lineWidth = pg.border; c.strokeStyle = '#000'; c.lineJoin = 'miter'; pg.panels.forEach((p) => { polyPath(c, p); c.stroke(); }); }
    pg.objs.forEach((o) => (o.type === 'bubble' ? drawBubble(c, o) : drawSfx(c, o)));
    if (ui) {
      const ap = pg.panels[T.panel];
      if (ap) { c.save(); c.setLineDash([10, 8]); c.lineWidth = 2; c.strokeStyle = '#2f7dff'; polyPath(c, ap); c.stroke(); c.restore(); }
      pg.objs.forEach((o) => { if (o.type === 'bubble' && !o.text) { c.save(); c.font = '700 15px "Comic Neue", sans-serif'; c.fillStyle = '#8a8a8a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('double-click to type', o.x + o.w / 2, o.y + o.h / 2); c.restore(); } });
      const s = T.sel && pg.objs.find((o) => o.id === T.sel);
      if (s) drawHandles(c, s);
    }
    c.restore();
  }
  function objBox(o) {
    if (o.type === 'bubble') return { x: o.x, y: o.y, w: o.w, h: o.h };
    const m = sfxMetrics(o); return { x: o.x - m.w / 2, y: o.y - m.h / 2, w: m.w, h: m.h };
  }
  function drawHandles(c, o) {
    const b = objBox(o);
    c.save(); c.setLineDash([6, 5]); c.lineWidth = 1.5; c.strokeStyle = '#2f7dff';
    if (o.type === 'sfx') { c.translate(o.x, o.y); c.rotate((o.rot || 0) * Math.PI / 180); c.strokeRect(-b.w / 2 - 6, -b.h / 2 - 6, b.w + 12, b.h + 12); c.setTransform(1, 0, 0, 1, 0, 0); }
    else c.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    c.setLineDash([]); c.fillStyle = '#2f7dff';
    const hs = handles(o);
    if (hs.resize) c.fillRect(hs.resize.x - 9, hs.resize.y - 9, 18, 18);
    if (hs.tail) { c.beginPath(); c.arc(hs.tail.x, hs.tail.y, 10, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
    c.restore();
  }
  function handles(o) {
    if (o.type === 'bubble') return { resize: { x: o.x + o.w, y: o.y + o.h }, tail: o.kind !== 'narration' && o.tail ? o.tail : null };
    const m = sfxMetrics(o), a = (o.rot || 0) * Math.PI / 180, hx = m.w / 2 + 6, hy = m.h / 2 + 6;
    return { resize: { x: o.x + hx * Math.cos(a) - hy * Math.sin(a), y: o.y + hx * Math.sin(a) + hy * Math.cos(a) } };
  }

  let raf = 0, thumbTimer = 0;
  function render() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { composite(ctx, page(), true); });
    clearTimeout(thumbTimer); thumbTimer = setTimeout(() => drawThumb(P.cur), 250);
  }

  // ---------- pages strip ----------
  function drawThumb(i) {
    const btn = $$('#mgPages .mg-thumb')[i]; if (!btn) return;
    const c = btn.querySelector('canvas'), x = c.getContext('2d');
    x.setTransform(c.width / PW, 0, 0, c.height / PH, 0, 0); composite(x, P.pages[i], false);
  }
  function renderPages() {
    const strip = $('#mgPages'); strip.innerHTML = '';
    P.pages.forEach((pg, i) => {
      const b = document.createElement('button');
      b.className = 'mg-thumb' + (i === P.cur ? ' active' : ''); b.title = 'Page ' + (i + 1);
      b.innerHTML = `<canvas width="108" height="153"></canvas><span>${i + 1}</span>`;
      b.onclick = () => goPage(i);
      strip.appendChild(b); drawThumb(i);
    });
    $('#mgInfo').textContent = `Page ${P.cur + 1} of ${P.pages.length}`;
  }
  function goPage(i) {
    closeEditor(); P.cur = clamp(i, 0, P.pages.length - 1); T.sel = null; T.panel = page().panels.length ? 0 : -1;
    renderPages(); renderLayouts(); renderScript(); renderSel(); render(); fit();
    $('#mgBorder').value = page().border; $('#mgBorderOut').textContent = page().border;
  }

  // ---------- undo ----------
  const undoS = [], redoS = [];
  function snap(pg = page()) {
    return { id: pg.id, img: pg.art.getContext('2d').getImageData(0, 0, PW, PH), objs: JSON.stringify(pg.objs), layout: pg.layout, panels: JSON.stringify(pg.panels), border: pg.border };
  }
  function pushUndo() { undoS.push(snap()); if (undoS.length > 20) undoS.shift(); redoS.length = 0; }
  function apply(s) {
    const i = P.pages.findIndex((p) => p.id === s.id); if (i < 0) return false;
    const pg = P.pages[i];
    pg.art.getContext('2d').putImageData(s.img, 0, 0); pg.objs = JSON.parse(s.objs); pg.layout = s.layout; pg.panels = JSON.parse(s.panels); pg.border = s.border;
    if (i !== P.cur) goPage(i); return true;
  }
  function undo() { closeEditor(); const s = undoS.pop(); if (!s) return toast('Nothing to undo'); const pg = P.pages.find((p) => p.id === s.id); if (pg) redoS.push(snap(pg)); apply(s); after(); }
  function redo() { closeEditor(); const s = redoS.pop(); if (!s) return toast('Nothing to redo'); const pg = P.pages.find((p) => p.id === s.id); if (pg) undoS.push(snap(pg)); apply(s); after(); }
  function after() { if (T.sel && !page().objs.some((o) => o.id === T.sel)) T.sel = null; renderLayouts(); renderScript(); renderSel(); render(); changed(); }

  // ---------- pointer ----------
  function pt(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * PW / r.width, y: (e.clientY - r.top) * PH / r.height }; }
  function panelAt(x, y) { const ps = page().panels; for (let i = ps.length - 1; i >= 0; i--) if (inPoly(x, y, ps[i])) return i; return -1; }
  function hitObj(x, y) {
    const objs = page().objs;
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.type === 'bubble') {
        if (o.kind === 'narration' ? (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h)
          : (((x - o.x - o.w / 2) / (o.w / 2 + 6)) ** 2 + ((y - o.y - o.h / 2) / (o.h / 2 + 6)) ** 2 <= 1)) return o;
      } else {
        const m = sfxMetrics(o), a = -(o.rot || 0) * Math.PI / 180, dx = x - o.x, dy = y - o.y;
        const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
        if (Math.abs(lx) <= m.w / 2 + 8 && Math.abs(ly) <= m.h / 2 + 8) return o;
      }
    }
    return null;
  }
  const near = (p, h, r = 16) => h && Math.hypot(p.x - h.x, p.y - h.y) <= r;
  let lastTap = { t: 0, id: null };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault(); // keep focus where we put it (the bubble text box)
    if (document.activeElement && document.activeElement !== ed && document.activeElement !== document.body) document.activeElement.blur();
    closeEditor();
    const p = pt(e), pg = page();
    canvas.setPointerCapture(e.pointerId);
    const pi = panelAt(p.x, p.y);
    if (T.tool === 'select') {
      const sel = T.sel && pg.objs.find((o) => o.id === T.sel);
      if (sel) {
        const hs = handles(sel);
        if (near(p, hs.tail, 18)) { pushUndo(); T.drag = { mode: 'tail', o: sel }; return; }
        if (near(p, hs.resize, 18)) { pushUndo(); T.drag = { mode: 'resize', o: sel, p0: p, w0: sel.w, h0: sel.h, s0: sel.size }; return; }
      }
      const o = hitObj(p.x, p.y);
      if (o) {
        const now = Date.now();
        if (lastTap.id === o.id && now - lastTap.t < 380) { lastTap = { t: 0, id: null }; T.sel = o.id; renderSel(); render(); openEditor(o); return; }
        lastTap = { t: now, id: o.id };
        T.sel = o.id; pushUndo();
        T.drag = { mode: 'move', o, p0: p, x0: o.x, y0: o.y, t0: o.tail ? { ...o.tail } : null, moved: false };
      } else { T.sel = null; if (pi >= 0) T.panel = pi; }
      renderSel(); renderScript(); updatePanelInfo(); render(); return;
    }
    if (pi >= 0) { T.panel = pi; updatePanelInfo(); }
    if (T.tool === 'bubble') { T.drag = { mode: 'newbubble', p0: p, p1: p }; return; }
    if (T.tool === 'sfx') { T.drag = { mode: 'newsfx', p0: p }; return; }
    // drawing tools
    pushUndo();
    const ac = pg.art.getContext('2d');
    ac.save();
    if (pi >= 0) { polyPath(ac, pg.panels[pi]); ac.clip(); }
    ac.lineCap = 'round'; ac.lineJoin = 'round';
    ac.globalCompositeOperation = T.tool === 'eraser' ? 'destination-out' : 'source-over';
    ac.strokeStyle = T.tool === 'white' ? '#fff' : T.tool === 'tone' ? toneTile($('#mgTone').value) : '#000';
    T.drag = { mode: 'draw', ac, last: p, lastW: null };
    strokeTo(e, p);
  });
  function widthFor(e) {
    const s = T.size, pen = e.pointerType === 'pen', pr = pen ? (e.pressure || 0.5) : 0.5;
    switch (T.tool) {
      case 'pen': return Math.max(0.6, s * (pen ? 0.25 + pr * 1.5 : 1));
      case 'brush': return Math.max(1, s * 3 * (pen ? 0.2 + pr * 1.6 : 1));
      case 'tone': return s * 8;
      default: return s * 5;
    }
  }
  function strokeTo(e, p) {
    const d = T.drag, w = widthFor(e), lw = d.lastW == null ? w : d.lastW * 0.6 + w * 0.4;
    d.ac.lineWidth = lw; d.ac.beginPath(); d.ac.moveTo(d.last.x, d.last.y); d.ac.lineTo(p.x + 0.01, p.y); d.ac.stroke();
    d.last = p; d.lastW = lw;
  }
  canvas.addEventListener('pointermove', (e) => {
    const d = T.drag; if (!d) return;
    if (d.mode === 'draw') { const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; (evs.length ? evs : [e]).forEach((ev) => strokeTo(ev, pt(ev))); render(); return; }
    const p = pt(e);
    if (d.mode === 'move') {
      const dx = p.x - d.p0.x, dy = p.y - d.p0.y; if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      d.o.x = d.x0 + dx; d.o.y = d.y0 + dy; if (d.t0) d.o.tail = { x: d.t0.x + dx, y: d.t0.y + dy };
    } else if (d.mode === 'tail') d.o.tail = { x: p.x, y: p.y };
    else if (d.mode === 'resize') {
      if (d.o.type === 'bubble') { d.o.w = Math.max(60, d.w0 + p.x - d.p0.x); d.o.h = Math.max(40, d.h0 + p.y - d.p0.y); }
      else d.o.size = clamp(Math.round(d.s0 + (p.x - d.p0.x + p.y - d.p0.y) / 2), 16, 300);
    } else if (d.mode === 'newbubble') {
      d.p1 = p; composite(ctx, page(), true);
      ctx.save(); ctx.setLineDash([8, 6]); ctx.strokeStyle = '#2f7dff'; ctx.lineWidth = 2;
      const x = Math.min(d.p0.x, p.x), y = Math.min(d.p0.y, p.y); ctx.strokeRect(x, y, Math.abs(p.x - d.p0.x), Math.abs(p.y - d.p0.y)); ctx.restore();
      return;
    }
    render();
  });
  function endDrag() {
    const d = T.drag; if (!d) return; T.drag = null;
    if (d.mode === 'draw') { d.ac.restore(); changed(); render(); return; }
    if (d.mode === 'newbubble') {
      let x = Math.min(d.p0.x, d.p1.x), y = Math.min(d.p0.y, d.p1.y), w = Math.abs(d.p1.x - d.p0.x), h = Math.abs(d.p1.y - d.p0.y);
      if (w < 40 || h < 30) { w = 240; h = 150; x = d.p0.x - w / 2; y = d.p0.y - h / 2; }
      addBubble({ x, y, w, h }, true); return;
    }
    if (d.mode === 'newsfx') { addSfx(d.p0.x, d.p0.y); return; }
    if (d.mode === 'move' && !d.moved) undoS.pop(); // a plain click isn't an edit
    renderSel(); changed(); render();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', (e) => { const p = pt(e), o = hitObj(p.x, p.y); if (o && !(T.editing && T.editing.o === o)) { T.sel = o.id; renderSel(); openEditor(o); } });

  // ---------- objects ----------
  function addBubble(box, edit, kind = $('#mgBubbleType').value) {
    pushUndo();
    const o = { id: rid(), type: 'bubble', kind, x: box.x, y: box.y, w: box.w, h: box.h, text: box.text || '', fs: 0 };
    if (kind !== 'narration') o.tail = { x: box.x + box.w * (P.rtl ? 0.7 : 0.3), y: box.y + box.h + Math.min(70, box.h * 0.5) };
    page().objs.push(o); T.sel = o.id;
    selectTool('select'); renderScript(); renderSel(); render(); changed();
    if (edit) openEditor(o);
    return o;
  }
  function addSfx(x, y) {
    pushUndo();
    const o = { id: rid(), type: 'sfx', x, y, text: 'DOOM', size: 90, rot: -8, style: 'solid' };
    page().objs.push(o); T.sel = o.id; selectTool('select'); renderSel(); render(); changed(); openEditor(o);
  }
  function delSel() {
    const pg = page(), i = pg.objs.findIndex((o) => o.id === T.sel); if (i < 0) return;
    pushUndo(); pg.objs.splice(i, 1); T.sel = null; renderScript(); renderSel(); render(); changed();
  }

  // ---------- typing inside a bubble ----------
  const ed = $('#mgEdit');
  function openEditor(o) {
    closeEditor(); pushUndo();
    T.editing = { o, before: o.text };
    const r = canvas.getBoundingClientRect(), hr = $('#mgHolder').getBoundingClientRect(), k = r.width / PW;
    let b = objBox(o);
    if (o.type === 'bubble') { const ib = innerBox(o); b = { x: o.x + (o.w - ib.w) / 2 - 6, y: o.y + (o.h - ib.h) / 2 - 6, w: ib.w + 12, h: ib.h + 12 }; }
    else b = { x: o.x - 160, y: o.y - 40, w: 320, h: 80 };
    Object.assign(ed.style, {
      left: (r.left - hr.left + b.x * k) + 'px', top: (r.top - hr.top + b.y * k) + 'px',
      width: Math.max(120, b.w * k) + 'px', height: Math.max(48, b.h * k) + 'px',
      fontSize: clamp((o.type === 'bubble' ? (o.fs || 22) : 26) * k, 13, 26) + 'px',
      fontFamily: o.type === 'sfx' || o.kind === 'shout' ? 'Bangers, Impact, sans-serif' : ''
    });
    ed.value = o.text || ''; ed.hidden = false; ed.focus(); ed.select();
  }
  function closeEditor() {
    const st = T.editing; if (!st) return; T.editing = null; ed.hidden = true;
    if (st.o.text === st.before) undoS.pop();
    if (st.o.type === 'sfx' && !st.o.text.trim()) { const pg = page(), i = pg.objs.indexOf(st.o); if (i >= 0) pg.objs.splice(i, 1); T.sel = null; }
    renderScript(); renderSel(); render(); changed();
  }
  ed.addEventListener('input', () => {
    const st = T.editing; if (!st) return; st.o.text = ed.value; render();
    const ta = $(`#mgScript textarea[data-id="${st.o.id}"]`); if (ta) ta.value = ed.value;
  });
  ed.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); closeEditor(); }
  });
  ed.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ed) closeEditor(); }, 0));

  // ---------- script panel ----------
  function readingOrder(objs) {
    return objs.filter((o) => o.type === 'bubble').slice().sort((a, b) => {
      const ay = a.y + a.h / 2, by = b.y + b.h / 2;
      if (Math.abs(ay - by) > 70) return ay - by;
      return P.rtl ? (b.x + b.w / 2) - (a.x + a.w / 2) : (a.x + a.w / 2) - (b.x + b.w / 2);
    });
  }
  function renderScript() {
    const ol = $('#mgScript'); ol.innerHTML = '';
    const list = readingOrder(page().objs);
    if (!list.length) { ol.innerHTML = '<p class="hint">No dialogue yet. Press "+ Add a line" or use the Bubble tool.</p>'; return; }
    list.forEach((o) => {
      const li = document.createElement('li'); if (o.id === T.sel) li.className = 'active';
      li.innerHTML = `<textarea rows="2" data-id="${o.id}" placeholder="Type what they say…"></textarea>
        <div class="meta"><select title="Bubble type">${['speech', 'thought', 'shout', 'whisper', 'narration'].map((k) => `<option value="${k}"${k === o.kind ? ' selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select>
        <button data-a="find">Show</button><button data-a="del">Delete</button></div>`;
      const ta = li.querySelector('textarea'); ta.value = o.text;
      let pushed = false;
      ta.addEventListener('focus', () => { pushed = false; T.sel = o.id; renderSel(); render(); $$('#mgScript li').forEach((x) => x.classList.toggle('active', x === li)); });
      ta.addEventListener('input', () => { if (!pushed) { pushUndo(); pushed = true; } o.text = ta.value; render(); changed(); });
      li.querySelector('select').onchange = (e) => { pushUndo(); o.kind = e.target.value; if (o.kind !== 'narration' && !o.tail) o.tail = { x: o.x + o.w * 0.5, y: o.y + o.h + 60 }; render(); renderSel(); changed(); };
      li.querySelector('[data-a="find"]').onclick = () => { T.sel = o.id; selectTool('select'); renderSel(); render(); openEditor(o); };
      li.querySelector('[data-a="del"]').onclick = () => { T.sel = o.id; delSel(); };
      ol.appendChild(li);
    });
  }
  $('#mgAddLine').onclick = () => {
    const pg = page(), ap = pg.panels[T.panel];
    const b = ap ? bbox(ap) : { x: LX, y: LY, w: LW, h: LH };
    const w = clamp(b.w * 0.4, 140, 260), h = clamp(w * 0.6, 84, 150);
    const others = pg.objs.filter((o) => o.type === 'bubble');
    const overlap = (x, y) => others.reduce((t, o) => t + Math.max(0, Math.min(x + w, o.x + o.w) - Math.max(x, o.x)) * Math.max(0, Math.min(y + h, o.y + o.h) - Math.max(y, o.y)), 0);
    let best = null;
    for (let gy = 0; gy <= 6; gy++) for (let gx = 0; gx <= 6; gx++) {
      const fx = P.rtl ? 1 - gx / 6 : gx / 6, x = b.x + 12 + (b.w - w - 24) * fx, y = b.y + 12 + (b.h - h - 24) * (gy / 6);
      const score = overlap(x, y) * 10 + gy * 40 + gx * 15; // prefer empty space, then the top, then the reading start
      if (!best || score < best.score) best = { x, y, score };
    }
    const o = addBubble({ x: best.x, y: best.y, w, h }, false);
    const ta = $(`#mgScript textarea[data-id="${o.id}"]`); if (ta) ta.focus();
  };

  // ---------- selected object panel ----------
  function renderSel() {
    const box = $('#mgSel'), o = T.sel && page().objs.find((x) => x.id === T.sel);
    if (!o) { box.innerHTML = '<p class="hint">Pick the Select tool and click a bubble or SFX. Double-click a bubble to write in it.</p>'; return; }
    if (o.type === 'bubble') {
      box.innerHTML = `<div class="field col"><span>Type</span><select id="mgSelKind">${['speech', 'thought', 'shout', 'whisper', 'narration'].map((k) => `<option value="${k}"${k === o.kind ? ' selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select></div>
        <label class="field">Text size <input type="range" id="mgSelFs" min="0" max="60" value="${o.fs || 0}"><output>${o.fs ? o.fs : 'Auto'}</output></label>
        <div class="row"><button class="btn sm" id="mgSelEdit">Write text</button>${o.kind !== 'narration' ? `<button class="btn sm" id="mgSelTail">${o.tail ? 'Remove tail' : 'Add tail'}</button>` : ''}</div>
        <div class="row"><button class="btn sm" id="mgSelFront">To front</button><button class="btn sm" id="mgSelDel">Delete</button></div>
        <p class="hint">Drag the bubble to move it, the square to resize, the round dot to point the tail at who's talking.</p>`;
      $('#mgSelKind').onchange = (e) => { pushUndo(); o.kind = e.target.value; if (o.kind !== 'narration' && !o.tail) o.tail = { x: o.x + o.w * 0.5, y: o.y + o.h + 60 }; renderScript(); renderSel(); render(); changed(); };
      const fs = $('#mgSelFs'); let pushed = false;
      fs.oninput = () => { if (!pushed) { pushUndo(); pushed = true; } o.fs = +fs.value; fs.nextElementSibling.textContent = o.fs || 'Auto'; render(); changed(); };
      $('#mgSelEdit').onclick = () => openEditor(o);
      if ($('#mgSelTail')) $('#mgSelTail').onclick = () => { pushUndo(); o.tail = o.tail ? null : { x: o.x + o.w * 0.5, y: o.y + o.h + 60 }; renderSel(); render(); changed(); };
    } else {
      box.innerHTML = `<label class="field col"><span>Sound effect</span><input id="mgSelText" maxlength="40"></label>
        <label class="field">Size <input type="range" id="mgSelSize" min="20" max="300" value="${o.size}"></label>
        <label class="field">Tilt <input type="range" id="mgSelRot" min="-60" max="60" value="${o.rot || 0}"></label>
        <label class="check"><input type="checkbox" id="mgSelHollow"${o.style === 'hollow' ? ' checked' : ''}> Hollow letters</label>
        <div class="row"><button class="btn sm" id="mgSelFront">To front</button><button class="btn sm" id="mgSelDel">Delete</button></div>`;
      const t = $('#mgSelText'); t.value = o.text; let pushed = false;
      const once = () => { if (!pushed) { pushUndo(); pushed = true; } };
      t.oninput = () => { once(); o.text = t.value; render(); changed(); };
      $('#mgSelSize').oninput = (e) => { once(); o.size = +e.target.value; render(); changed(); };
      $('#mgSelRot').oninput = (e) => { once(); o.rot = +e.target.value; render(); changed(); };
      $('#mgSelHollow').onchange = (e) => { pushUndo(); o.style = e.target.checked ? 'hollow' : 'solid'; render(); changed(); };
    }
    $('#mgSelDel').onclick = delSel;
    $('#mgSelFront').onclick = () => { const pg = page(), i = pg.objs.indexOf(o); pushUndo(); pg.objs.splice(i, 1); pg.objs.push(o); render(); changed(); };
  }

  // ---------- layouts + panel effects ----------
  function renderLayouts() {
    const box = $('#mgLayouts'); box.innerHTML = '';
    Object.entries(LAYOUTS).forEach(([k, L]) => {
      const b = document.createElement('button'); b.title = L.name; if (page().layout === k) b.className = 'active';
      const c = document.createElement('canvas'); c.width = 100; c.height = 141; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, 100, 141); x.scale(100 / PW, 141 / PH); x.lineWidth = 22; x.strokeStyle = '#000';
      L.make().forEach((p) => { polyPath(x, p); x.stroke(); });
      if (k === 'blank') { x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#777'; x.font = '700 13px sans-serif'; x.textAlign = 'center'; x.fillText('none', 50, 74); }
      b.appendChild(c);
      b.onclick = () => { pushUndo(); const pg = page(); pg.layout = k; pg.panels = L.make(); T.panel = pg.panels.length ? 0 : -1; renderLayouts(); updatePanelInfo(); render(); changed(); };
      box.appendChild(b);
    });
    updatePanelInfo();
  }
  function updatePanelInfo() {
    const n = page().panels.length;
    $('#mgPanelInfo').textContent = n ? (T.panel >= 0 ? `Panel ${T.panel + 1} of ${n} is selected (blue dashed line).` : 'Click inside a panel to select it.') : 'This page has no panels, so effects cover the whole page.';
  }
  function activeArea() { const pg = page(); return pg.panels[T.panel] || (pg.panels.length ? null : rect(0, 0, PW, PH)); }
  function panelFx(fn) {
    const area = activeArea(); if (!area) return toast('Click inside a panel first');
    pushUndo(); const ac = page().art.getContext('2d'); ac.save(); polyPath(ac, area); ac.clip(); fn(ac, bbox(area)); ac.restore(); render(); changed();
  }
  $('#mgFxSpeed').onclick = () => panelFx((c, b) => {
    const a = +$('#mgAngle').value * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.hypot(b.w, b.h) / 2 + 20;
    c.strokeStyle = '#000'; c.lineCap = 'round';
    for (let s = -R; s < R; s += 3 + Math.random() * 7) {
      if (Math.random() < 0.25) continue;
      const t0 = -R + Math.random() * R * 0.7, t1 = R - Math.random() * R * 0.7, ox = cx + nx * s, oy = cy + ny * s;
      c.lineWidth = 0.8 + Math.random() * 2.4; c.beginPath(); c.moveTo(ox + dx * t0, oy + dy * t0); c.lineTo(ox + dx * t1, oy + dy * t1); c.stroke();
    }
  });
  $('#mgFxFocus').onclick = () => panelFx((c, b) => {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.hypot(b.w, b.h), r0 = Math.min(b.w, b.h) * 0.3;
    c.fillStyle = '#000';
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, wa = 0.004 + Math.random() * 0.012, ri = r0 * (0.8 + Math.random() * 0.7);
      c.beginPath(); c.moveTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri);
      c.lineTo(cx + Math.cos(a - wa) * R, cy + Math.sin(a - wa) * R); c.lineTo(cx + Math.cos(a + wa) * R, cy + Math.sin(a + wa) * R); c.closePath(); c.fill();
    }
  });
  $('#mgFxTone').onclick = () => panelFx((c, b) => { c.globalCompositeOperation = 'destination-over'; c.fillStyle = toneTile($('#mgTone').value); c.fillRect(b.x, b.y, b.w, b.h); });
  $('#mgFxBlack').onclick = () => panelFx((c, b) => { c.fillStyle = '#000'; c.fillRect(b.x, b.y, b.w, b.h); toast('Draw on it with the White-out brush'); });
  $('#mgFxClear').onclick = () => panelFx((c, b) => { c.clearRect(b.x, b.y, b.w, b.h); });
  $('#mgAngle').oninput = (e) => ($('#mgAngleOut').textContent = e.target.value + '°');
  let borderPushed = false;
  $('#mgBorder').oninput = (e) => { if (!borderPushed) { pushUndo(); borderPushed = true; } page().border = +e.target.value; $('#mgBorderOut').textContent = e.target.value; render(); changed(); };
  $('#mgBorder').onchange = () => (borderPushed = false);

  // ---------- AI panel art (free Pollinations) ----------
  const AI_STYLES = {
    ink: 'black and white manga panel, japanese manga style, clean bold ink line art, high contrast, no color, no text, no speech bubbles',
    tone: 'black and white manga panel, japanese manga style, ink line art with halftone screentone shading, detailed background, no color, no text, no speech bubbles',
    sketch: 'rough pencil manga storyboard sketch on white paper, graphite lines, no text',
    anime: 'anime key visual, clean cel shading, vibrant colors, no text',
    cyber: 'cyberpunk manga panel in color, neon-lit futuristic city, holographic signs, rain, glowing magenta and cyan lights, dramatic lighting, no text, no speech bubbles',
    cyberink: 'black and white cyberpunk manga panel, futuristic city, cybernetic implants, mechs and cables, bold ink line art, screentone shading, no color, no text, no speech bubbles',
    shonen: 'shonen battle manga panel, dynamic action pose, speed lines, bold expressive ink, no color, no text, no speech bubbles',
    horror: 'horror manga panel, unsettling atmosphere, heavy black ink, fine hatching, no color, no text, no speech bubbles',
    chibi: 'cute chibi manga style, simple clean ink lines, big expressive eyes, no color, no text, no speech bubbles'
  };
  const AI_COLOR = new Set(['anime', 'cyber']); // these keep their colors; the rest print black & white
  let aiBusy = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function aiFetch(prompt, w, h, status) {
    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + `?width=${w}&height=${h}&model=flux&nologo=true&seed=${Math.floor(Math.random() * 1e9)}&referrer=luidgotdox`;
    for (let t = 0; t < 4; t++) {
      status('Drawing… free AI can take up to a minute.');
      const res = await fetch(url);
      if (res.ok && (res.headers.get('content-type') || '').startsWith('image/')) return createImageBitmap(await res.blob());
      let wait = 45;
      if (res.status === 402 || res.status === 429) { try { const j = await res.json(); const m = /after (\d+)s/i.exec((j.error && j.error.message) || ''); if (m) wait = +m[1] + 2; } catch (_) {} }
      else if (res.status >= 500) wait = 8; else throw new Error('The AI said no (' + res.status + '). Try different words.');
      for (let s = wait; s > 0; s--) { status(`Free AI limit: 1 picture every 45 seconds. Trying again in ${s}s…`); await sleep(1000); }
    }
    throw new Error('The free AI is busy. Try again in a minute.');
  }
  $('#mgAiGo').onclick = async () => {
    if (aiBusy) return;
    const text = $('#mgAiPrompt').value.trim();
    if (!text) { toast('Describe the panel first'); $('#mgAiPrompt').focus(); return; }
    if (!navigator.onLine) return toast('AI needs the internet');
    const area = activeArea(); if (!area) return toast('Click inside a panel first');
    const pgId = page().id, b = bbox(area), style = $('#mgAiStyle').value;
    const r = b.w / b.h; let w = 1024, h = Math.round(1024 / r); if (h > 1024) { h = 1024; w = Math.round(1024 * r); }
    w = Math.max(256, w - (w % 16)); h = Math.max(256, h - (h % 16));
    const st = $('#mgAiStatus'), btn = $('#mgAiGo'), status = (m) => (st.textContent = m);
    aiBusy = true; btn.disabled = true; btn.textContent = 'Drawing…';
    try {
      const bmp = await aiFetch(text + ', ' + AI_STYLES[style], w, h, status);
      const pg = P.pages.find((p) => p.id === pgId); if (!pg) throw new Error('That page was deleted.');
      const tmp = document.createElement('canvas'); tmp.width = Math.round(b.w); tmp.height = Math.round(b.h);
      const tx = tmp.getContext('2d'), s = Math.max(b.w / bmp.width, b.h / bmp.height);
      tx.drawImage(bmp, (b.w - bmp.width * s) / 2, (b.h - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
      if (!AI_COLOR.has(style)) { // keep it black & white like a printed manga
        const id = tx.getImageData(0, 0, tmp.width, tmp.height), d = id.data;
        for (let i = 0; i < d.length; i += 4) { let g = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; g = clamp((g - 128) * 1.18 + 128, 0, 255); d[i] = d[i + 1] = d[i + 2] = g; }
        tx.putImageData(id, 0, 0);
      }
      if (pg !== page()) goPage(P.pages.indexOf(pg));
      pushUndo(); const ac = pg.art.getContext('2d'); ac.save(); polyPath(ac, area); ac.clip(); ac.drawImage(tmp, b.x, b.y); ac.restore();
      render(); changed(); status('Done! Ink over it, add bubbles, or Undo to remove it.'); toast('AI panel added');
    } catch (e) { status(e.message || 'Something went wrong. Try again.'); }
    finally { aiBusy = false; btn.disabled = false; btn.textContent = 'Generate'; }
  };

  // ---------- tools + UI wiring ----------
  function selectTool(t) {
    T.tool = t; $$('#mgTools .tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    canvas.classList.toggle('sel', t === 'select');
  }
  $$('#mgTools .tool').forEach((b) => (b.onclick = () => selectTool(b.dataset.tool)));
  $('#mgSize').oninput = (e) => { T.size = +e.target.value; $('#mgSizeOut').textContent = e.target.value; };
  $('#mgUndo').onclick = undo; $('#mgRedo').onclick = redo;
  $$('[data-mgsub]').forEach((b) => (b.onclick = () => {
    $$('[data-mgsub]').forEach((x) => x.classList.toggle('active', x === b));
    $$('.mg-sub').forEach((s) => (s.hidden = s.id !== 'mgsub-' + b.dataset.mgsub));
  }));
  $('#mgTitle').oninput = (e) => { P.title = e.target.value; changed(); };
  $('#mgRtl').onchange = (e) => { P.rtl = e.target.checked; renderScript(); changed(); };

  $('#mgAddPage').onclick = () => { P.pages.splice(P.cur + 1, 0, newPage(page().layout)); goPage(P.cur + 1); changed(); };
  $('#mgDupPage').onclick = () => {
    const src = page(), pg = newPage(src.layout); pg.panels = JSON.parse(JSON.stringify(src.panels)); pg.border = src.border;
    pg.objs = JSON.parse(JSON.stringify(src.objs)).map((o) => ({ ...o, id: rid() })); pg.art.getContext('2d').drawImage(src.art, 0, 0);
    P.pages.splice(P.cur + 1, 0, pg); goPage(P.cur + 1); changed();
  };
  $('#mgDelPage').onclick = async () => {
    if (P.pages.length === 1) return toast('A manga needs at least one page');
    if (!(await modal('Delete this page?', `<p>Page ${P.cur + 1} and everything on it will be removed.</p>`, { ok: 'Delete' }))) return;
    const id = page().id; P.pages.splice(P.cur, 1);
    for (let i = undoS.length - 1; i >= 0; i--) if (undoS[i].id === id) undoS.splice(i, 1);
    goPage(Math.min(P.cur, P.pages.length - 1)); changed();
  };
  const move = (d) => { const j = P.cur + d; if (j < 0 || j >= P.pages.length) return; [P.pages[P.cur], P.pages[j]] = [P.pages[j], P.pages[P.cur]]; goPage(j); changed(); };
  $('#mgLeft').onclick = () => move(-1); $('#mgRight').onclick = () => move(1);

  $('#mgNew').onclick = async () => {
    if (!(await modal('Start a new manga?', '<p>This clears the current one from this browser. Press Save first if you want to keep it.</p>', { ok: 'Start new' }))) return;
    undoS.length = redoS.length = 0; P.title = ''; P.pages = [newPage()]; $('#mgTitle').value = ''; goPage(0); changed();
  };

  window.addEventListener('keydown', (e) => {
    if ($('#view-manga').hidden) return;
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 's') { e.preventDefault(); saveFile(); return; }
    if (mod) return;
    if ((k === 'delete' || k === 'backspace') && T.sel) { e.preventDefault(); delSel(); return; }
    if (k === 'enter' && T.sel) { const o = page().objs.find((x) => x.id === T.sel); if (o) { e.preventDefault(); openEditor(o); } return; }
    const map = { v: 'select', p: 'pen', b: 'brush', e: 'eraser', n: 'tone', w: 'white', s: 'bubble', x: 'sfx' };
    if (map[k]) selectTool(map[k]);
    if (k === '[' || k === ']') { const v = clamp(T.size + (k === ']' ? 1 : -1), 1, 60); T.size = v; $('#mgSize').value = v; $('#mgSizeOut').textContent = v; }
  });

  // ---------- fit canvas to screen ----------
  function fit() {
    const st = $('#mgStage'); if (!st.clientWidth) return;
    const narrow = window.innerWidth <= 1000;
    const k = Math.min((st.clientWidth - 36) / PW, narrow ? 1 : (st.clientHeight - 36) / PH, 1);
    canvas.style.width = Math.round(PW * k) + 'px'; canvas.style.height = Math.round(PH * k) + 'px';
  }
  window.addEventListener('resize', () => { closeEditor(); fit(); });

  // ---------- save / load ----------
  const blobToDataURL = (b) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
  const toBlob = (c) => new Promise((r) => c.toBlob(r, 'image/png'));
  async function loadImg(src) { const im = new Image(); im.src = src; await im.decode(); return im; }
  async function serialize(asDataURL) {
    const pages = [];
    for (const pg of P.pages) {
      const blob = await toBlob(pg.art);
      pages.push({ layout: pg.layout, panels: pg.panels, border: pg.border, objs: pg.objs, art: asDataURL ? await blobToDataURL(blob) : blob });
    }
    return { app: 'free-studio', kind: 'manga', version: 1, title: P.title, rtl: P.rtl, pages };
  }
  async function load(data) {
    if (!data || !Array.isArray(data.pages) || !data.pages.length) { toast('That manga file looks empty.'); return; }
    const pages = [];
    for (const d of data.pages) {
      const pg = newPage(LAYOUTS[d.layout] ? d.layout : 'blank');
      if (Array.isArray(d.panels)) pg.panels = d.panels; pg.border = Number.isFinite(d.border) ? d.border : 4;
      pg.objs = Array.isArray(d.objs) ? d.objs.filter((o) => o && (o.type === 'bubble' || o.type === 'sfx')).map((o) => ({ ...o, id: o.id || rid(), text: String(o.text || '') })) : [];
      if (d.art) {
        try { const src = typeof d.art === 'string' ? d.art : URL.createObjectURL(d.art); const im = await loadImg(src); pg.art.getContext('2d').drawImage(im, 0, 0); if (typeof d.art !== 'string') URL.revokeObjectURL(src); } catch (_) {}
      }
      pages.push(pg);
    }
    P.pages = pages; P.title = String(data.title || ''); P.rtl = data.rtl !== false;
    $('#mgTitle').value = P.title; $('#mgRtl').checked = P.rtl;
    undoS.length = redoS.length = 0; goPage(0); changed();
  }
  // IndexedDB autosave (localStorage is too small for page art)
  let dbP = null;
  function db() {
    return dbP || (dbP = new Promise((res, rej) => { const r = indexedDB.open('luidgotdox-manga', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  }
  async function idb(mode, fn) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction('kv', mode); const q = fn(tx.objectStore('kv')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }); }
  let saveTimer = 0;
  function changed() { clearTimeout(saveTimer); saveTimer = setTimeout(autosave, 1200); }
  async function autosave() { try { const data = await serialize(false); await idb('readwrite', (s) => s.put(data, 'current')); } catch (e) { toast('Could not autosave (browser storage full?)'); } }

  async function saveFile() {
    const data = await serialize(true);
    download(safeName(P.title || 'my-manga') + '.fsmanga', JSON.stringify(data), 'application/json');
    toast('Saved. Open it later with Open (keeps pages, bubbles and art).');
  }
  $('#mgSave').onclick = saveFile;
  $('#mgOpen').onclick = async () => {
    const f = await pickFile('.fsmanga,.json,application/json'); if (!f) return;
    try { const d = JSON.parse(await f.text()); if (d.app !== 'free-studio' || d.kind !== 'manga') throw 0; await load(d); toast('Manga opened'); }
    catch (_) { toast('That isn\'t a LuidgotDOx manga file.'); }
  };

  // ---------- export ----------
  function exportCanvas(pg, scale = 1) {
    const c = document.createElement('canvas'); c.width = PW * scale; c.height = PH * scale;
    const x = c.getContext('2d'); x.scale(scale, scale); composite(x, pg, false); return c;
  }
  $('#mgPng').onclick = async () => {
    closeEditor(); const c = exportCanvas(page());
    download(`${safeName(P.title || 'manga')}-page-${P.cur + 1}.png`, await toBlob(c), 'image/png');
  };
  $('#mgPdf').onclick = async () => {
    closeEditor(); toast('Making your PDF…', 6000);
    try { await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js'); }
    catch (_) { return toast('PDF maker needs the internet once. Try again online.'); }
    const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: [182, 257] }); // B5, the usual manga size
    P.pages.forEach((pg, i) => { if (i) doc.addPage([182, 257]); doc.addImage(exportCanvas(pg).toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 182, 257); });
    doc.save(safeName(P.title || 'my-manga') + '.pdf'); toast('PDF downloaded');
  };

  registerBackup('manga', { export: () => serialize(true), import: (d) => load(d) });
  window.FS.manga = { load, state: P };

  // ---------- start ----------
  let started = false;
  async function start() {
    if (started) { fit(); render(); return; }
    started = true;
    P.pages = [newPage()];
    goPage(0);
    if (document.fonts) document.fonts.ready.then(render);
    try {
      const saved = await Promise.race([idb('readonly', (s) => s.get('current')), sleep(4000).then(() => null)]);
      if (saved && saved.pages && saved.pages.length && undoS.length === 0) await load(saved);
    } catch (_) {}
  }
  onShow('manga', () => { start(); requestAnimationFrame(fit); });
})();
