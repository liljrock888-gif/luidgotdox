/* LuidgotDOx — Art Studio */
(function () {
  'use strict';
  const { $, $$, store, toast, modal, download, pickFile, readDataURL, safeName, shareFile } = window.FS;

  const view = $('#view'), overlay = $('#overlay'), holder = $('#holder'), stage = $('#stage');
  const vctx = view.getContext('2d');
  const octx = overlay.getContext('2d');

  const S = {
    W: 1280, H: 720,
    layers: [], active: 0,
    tool: 'brush',
    color: '#ff3d7f',
    size: 12, opacity: 1,
    grid: false, zoom: 1, scale: 1,
    palette: ['#ff3d7f', '#ffb000', '#2ec4b6', '#7c4dff', '#1d1a2e'],
    guides: null,          // name of guide set drawn on overlay only
    title: 'my-art',
    dirty: false
  };
  const pixelMode = () => S.W <= 128 && S.H <= 128;

  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  let strokeBuf = mk(1, 1), sctx = strokeBuf.getContext('2d');
  const scratch = mk(1, 1), scctx = scratch.getContext('2d');

  // ---------- layers ----------
  function newLayer(name) {
    const c = mk(S.W, S.H);
    return { name, canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }), visible: true };
  }
  const cur = () => S.layers[S.active];

  function resetDoc(W, H, bg) {
    S.W = W; S.H = H;
    S.layers = [newLayer('Background'), newLayer('Layer 1')];
    if (bg) { const c = S.layers[0].ctx; c.fillStyle = bg; c.fillRect(0, 0, W, H); }
    S.active = 1; S.guides = null; S.zoom = 1;
    undoStack.length = 0; redoStack.length = 0;
    view.width = W; view.height = H;
    strokeBuf = mk(W, H); sctx = strokeBuf.getContext('2d');
    scratch.width = W; scratch.height = H;
    S.grid = pixelMode();
    $('#gridBtn').classList.toggle('on', S.grid);
    holder.style.imageRendering = pixelMode() ? 'pixelated' : 'auto';
    view.style.imageRendering = pixelMode() ? 'pixelated' : 'auto';
    if (pixelMode()) setSize(1); else if (S.size === 1) setSize(12);
    fit(); renderLayers(); render(); changed();
  }

  // ---------- display ----------
  function fit() {
    const pad = 60;
    const aw = Math.max(100, stage.clientWidth - pad), ah = Math.max(100, stage.clientHeight - pad);
    let s = Math.min(aw / S.W, ah / S.H);
    if (pixelMode()) s = Math.max(1, Math.floor(s));
    s = Math.min(s * S.zoom, 40);
    S.scale = s;
    const dw = Math.round(S.W * s), dh = Math.round(S.H * s);
    view.style.width = dw + 'px'; view.style.height = dh + 'px';
    holder.style.width = dw + 'px'; holder.style.height = dh + 'px';
    const dpr = window.devicePixelRatio || 1;
    overlay.width = Math.round(dw * dpr); overlay.height = Math.round(dh * dpr);
    overlay.style.width = dw + 'px'; overlay.style.height = dh + 'px';
    $('#canvasInfo').textContent = `${S.W}×${S.H} · ${Math.round(s * 100)}%`;
    drawOverlay();
  }
  window.addEventListener('resize', () => { if (!$('#view-art').hidden) fit(); });
  window.FS.onShow('art', () => requestAnimationFrame(fit));

  function render() {
    vctx.clearRect(0, 0, S.W, S.H);
    S.layers.forEach((L, i) => {
      if (!L.visible) return;
      if (i === S.active && drawing && (S.tool === 'brush' || S.tool === 'eraser')) {
        if (S.tool === 'brush') {
          vctx.drawImage(L.canvas, 0, 0);
          vctx.globalAlpha = S.opacity; vctx.drawImage(strokeBuf, 0, 0); vctx.globalAlpha = 1;
        } else {
          scctx.clearRect(0, 0, S.W, S.H);
          scctx.drawImage(L.canvas, 0, 0);
          scctx.globalCompositeOperation = 'destination-out'; scctx.globalAlpha = S.opacity;
          scctx.drawImage(strokeBuf, 0, 0);
          scctx.globalCompositeOperation = 'source-over'; scctx.globalAlpha = 1;
          vctx.drawImage(scratch, 0, 0);
        }
      } else vctx.drawImage(L.canvas, 0, 0);
    });
  }

  function flatten() {
    const c = mk(S.W, S.H), x = c.getContext('2d');
    S.layers.forEach((L) => L.visible && x.drawImage(L.canvas, 0, 0));
    return c;
  }

  // overlay: drawn in screen pixels; preview fn receives ctx in canvas coords
  function drawOverlay(preview) {
    const dpr = window.devicePixelRatio || 1, k = S.scale * dpr;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.setTransform(k, 0, 0, k, 0, 0);
    if (preview) { octx.save(); preview(octx); octx.restore(); }
    if (S.guides && GUIDES[S.guides]) { octx.save(); GUIDES[S.guides](octx, 1 / k); octx.restore(); }
    if (S.grid) {
      const step = pixelMode() ? 1 : Math.max(8, Math.round(Math.min(S.W, S.H) / 24 / 8) * 8);
      if (step * k >= 4) {
        octx.beginPath();
        octx.lineWidth = 1 / k;
        octx.strokeStyle = 'rgba(120,110,160,.35)';
        for (let x = 0; x <= S.W; x += step) { octx.moveTo(x, 0); octx.lineTo(x, S.H); }
        for (let y = 0; y <= S.H; y += step) { octx.moveTo(0, y); octx.lineTo(S.W, y); }
        octx.stroke();
      }
    }
  }

  // ---------- undo ----------
  const undoStack = [], redoStack = [];
  const LIMIT = 30;
  function snapAll() {
    return { all: true, W: S.W, H: S.H, active: S.active,
      layers: S.layers.map((L) => ({ name: L.name, visible: L.visible, data: L.ctx.getImageData(0, 0, S.W, S.H) })) };
  }
  function snapLayer(i = S.active) { return { all: false, i, data: S.layers[i].ctx.getImageData(0, 0, S.W, S.H) }; }
  function pushUndo(entry) {
    undoStack.push(entry); if (undoStack.length > LIMIT) undoStack.shift();
    redoStack.length = 0; changed();
  }
  function restore(e) {
    if (e.all) {
      if (e.W !== S.W || e.H !== S.H) {
        S.W = e.W; S.H = e.H; view.width = e.W; view.height = e.H;
        strokeBuf = mk(e.W, e.H); sctx = strokeBuf.getContext('2d'); scratch.width = e.W; scratch.height = e.H;
      }
      S.layers = e.layers.map((l) => { const L = newLayer(l.name); L.visible = l.visible; L.ctx.putImageData(l.data, 0, 0); return L; });
      S.active = Math.min(e.active, S.layers.length - 1);
      fit();
    } else if (S.layers[e.i]) S.layers[e.i].ctx.putImageData(e.data, 0, 0);
    renderLayers(); render(); changed();
  }
  function undo() {
    const e = undoStack.pop(); if (!e) return toast('Nothing to undo');
    redoStack.push(e.all ? snapAll() : snapLayer(e.i)); restore(e);
  }
  function redo() {
    const e = redoStack.pop(); if (!e) return toast('Nothing to redo');
    undoStack.push(e.all ? snapAll() : snapLayer(e.i)); restore(e);
  }
  $('#undo').onclick = undo; $('#redo').onclick = redo;

  // ---------- layers UI ----------
  function renderLayers() {
    const ul = $('#layers'); ul.innerHTML = '';
    for (let i = S.layers.length - 1; i >= 0; i--) {
      const L = S.layers[i];
      const li = document.createElement('li');
      li.className = i === S.active ? 'active' : '';
      li.innerHTML = `<button class="eye" title="Show/hide">${L.visible ? 'Hide' : 'Show'}</button><span class="name"></span>` +
        `<button class="eye up" title="Move up">Up</button><button class="eye dn" title="Move down">Down</button>`;
      li.querySelector('.name').textContent = L.name;
      li.onclick = () => { S.active = i; renderLayers(); };
      li.ondblclick = async () => {
        const ok = await modal('Rename layer', `<label class="field col">Name <input id="ln" value=""></label>`,
          { onOpen: (b) => (b.querySelector('#ln').value = L.name) });
        if (ok) { L.name = $('#ln').value.trim() || L.name; renderLayers(); changed(); }
      };
      li.querySelector('.eye').onclick = (e) => { e.stopPropagation(); L.visible = !L.visible; renderLayers(); render(); changed(); };
      li.querySelector('.up').onclick = (e) => { e.stopPropagation(); moveLayer(i, 1); };
      li.querySelector('.dn').onclick = (e) => { e.stopPropagation(); moveLayer(i, -1); };
      ul.appendChild(li);
    }
  }
  function moveLayer(i, d) {
    const j = i + d; if (j < 0 || j >= S.layers.length) return;
    pushUndo(snapAll());
    [S.layers[i], S.layers[j]] = [S.layers[j], S.layers[i]];
    if (S.active === i) S.active = j; else if (S.active === j) S.active = i;
    renderLayers(); render();
  }
  function addLayer(name) {
    pushUndo(snapAll());
    S.layers.splice(S.active + 1, 0, newLayer(name || 'Layer ' + (S.layers.length)));
    S.active++; renderLayers(); render();
    return cur();
  }
  $('#addLayer').onclick = () => addLayer();
  $('#delLayer').onclick = () => {
    if (S.layers.length <= 1) return toast('Need at least one layer');
    pushUndo(snapAll()); S.layers.splice(S.active, 1);
    S.active = Math.max(0, S.active - 1); renderLayers(); render();
  };
  $('#clearLayer').onclick = () => { pushUndo(snapLayer()); cur().ctx.clearRect(0, 0, S.W, S.H); render(); };

  // ---------- tool settings ----------
  const DEFAULT_SWATCHES = ['#000000', '#ffffff', '#ff3d7f', '#ff7b00', '#ffd400', '#2ecc71', '#00b4d8', '#3a6bff',
    '#7c4dff', '#c04dff', '#8b5a2b', '#808080', '#ffb3c7', '#b8f2e6', '#1d1a2e', '#f4e1c1'];
  function renderSwatches() {
    const box = $('#swatches'); box.innerHTML = '';
    DEFAULT_SWATCHES.forEach((c) => {
      const b = document.createElement('button'); b.style.background = c; b.title = c;
      b.onclick = () => setColor(c); box.appendChild(b);
    });
  }
  function setColor(c) { S.color = c; $('#color').value = c; }
  function setSize(n) { S.size = n; $('#size').value = n; $('#sizeOut').textContent = n; }
  $('#color').oninput = (e) => (S.color = e.target.value);
  $('#size').oninput = (e) => setSize(+e.target.value);
  $('#opacity').oninput = (e) => { S.opacity = e.target.value / 100; $('#opOut').textContent = e.target.value + '%'; };
  function setTool(t) {
    S.tool = t;
    $$('#tools .tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    $('#textOpts').style.display = t === 'text' ? '' : 'none';
    overlay.style.cursor = t === 'picker' ? 'copy' : t === 'text' ? 'text' : 'crosshair';
  }
  $$('#tools .tool').forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  $('#gridBtn').onclick = () => { S.grid = !S.grid; $('#gridBtn').classList.toggle('on', S.grid); drawOverlay(); };

  // zoom controls
  const zoomRow = document.createElement('span');
  zoomRow.className = 'row';
  zoomRow.innerHTML = '<button class="btn sm" id="zOut" title="Zoom out">−</button><button class="btn sm" id="zFit" title="Fit">Fit</button><button class="btn sm" id="zIn" title="Zoom in">+</button>';
  $('#canvasInfo').after(zoomRow);
  $('#zOut').onclick = () => { S.zoom = Math.max(.25, S.zoom / 1.25); fit(); };
  $('#zIn').onclick = () => { S.zoom = Math.min(8, S.zoom * 1.25); fit(); };
  $('#zFit').onclick = () => { S.zoom = 1; fit(); };

  // ---------- drawing ----------
  let drawing = false, start = null, last = null;
  function pos(e) {
    const r = overlay.getBoundingClientRect();
    return { x: (e.clientX - r.left) * S.W / r.width, y: (e.clientY - r.top) * S.H / r.height };
  }
  function plotPixelLine(ctx, a, b, size) {
    let x0 = Math.floor(a.x), y0 = Math.floor(a.y); const x1 = Math.floor(b.x), y1 = Math.floor(b.y);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy; const o = Math.floor(size / 2);
    for (;;) {
      ctx.fillRect(x0 - o, y0 - o, size, size);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function strokeSeg(a, b) {
    sctx.fillStyle = sctx.strokeStyle = S.color;
    if (pixelMode()) return plotPixelLine(sctx, a, b, S.size);
    sctx.lineWidth = S.size; sctx.lineCap = 'round'; sctx.lineJoin = 'round';
    sctx.beginPath(); sctx.moveTo(a.x, a.y); sctx.lineTo(b.x, b.y); sctx.stroke();
  }
  function shapePath(ctx, a, b, shift) {
    let w = b.x - a.x, h = b.y - a.y;
    if (shift && S.tool !== 'line') { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    ctx.beginPath();
    if (S.tool === 'line') {
      if (shift) { // snap to 45°
        const ang = Math.round(Math.atan2(h, w) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(w, h);
        w = Math.cos(ang) * len; h = Math.sin(ang) * len;
      }
      ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + w, a.y + h);
    } else if (S.tool === 'rect') ctx.rect(a.x, a.y, w, h);
    else ctx.ellipse(a.x + w / 2, a.y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
  }
  function paintShape(ctx, a, b, shift) {
    ctx.strokeStyle = ctx.fillStyle = S.color;
    ctx.lineWidth = S.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    shapePath(ctx, a, b, shift);
    if ($('#shapeFill').checked && S.tool !== 'line') ctx.fill(); else ctx.stroke();
  }

  overlay.addEventListener('pointerdown', async (e) => {
    if (e.button !== 0) return;
    const p = pos(e);
    if (!cur().visible) { cur().visible = true; renderLayers(); }
    if (S.tool === 'picker') return pickColor(p);
    if (S.tool === 'fill') return floodFill(p);
    if (S.tool === 'text') return placeText(p);
    overlay.setPointerCapture(e.pointerId);
    drawing = true; start = last = p;
    if (S.tool === 'brush' || S.tool === 'eraser') {
      sctx.clearRect(0, 0, S.W, S.H);
      strokeSeg(p, p); render();
    }
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (S.tool === 'brush' || S.tool === 'eraser') {
      for (const ev of evs) { const p = pos(ev); strokeSeg(last, p); last = p; }
      render();
    } else {
      const p = pos(e); last = p;
      drawOverlay((c) => { c.globalAlpha = S.opacity; paintShape(c, start, p, e.shiftKey); });
    }
  });
  function endStroke(e) {
    if (!drawing) return;
    drawing = false;
    const L = cur();
    pushUndo(snapLayer());
    L.ctx.save(); L.ctx.globalAlpha = S.opacity;
    if (S.tool === 'brush') L.ctx.drawImage(strokeBuf, 0, 0);
    else if (S.tool === 'eraser') { L.ctx.globalCompositeOperation = 'destination-out'; L.ctx.drawImage(strokeBuf, 0, 0); }
    else paintShape(L.ctx, start, last, e && e.shiftKey);
    L.ctx.restore();
    sctx.clearRect(0, 0, S.W, S.H);
    drawOverlay(); render();
  }
  overlay.addEventListener('pointerup', endStroke);
  overlay.addEventListener('pointercancel', endStroke);

  function pickColor(p) {
    const d = flatten().getContext('2d').getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
    if (d[3] === 0) return toast('That spot is see-through');
    setColor('#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
    toast('Picked ' + S.color);
  }

  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function floodFill(p) {
    const W = S.W, H = S.H, x0 = Math.floor(p.x), y0 = Math.floor(p.y);
    if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return;
    const src = flatten().getContext('2d').getImageData(0, 0, W, H).data;
    const i0 = (y0 * W + x0) * 4;
    const t = [src[i0], src[i0 + 1], src[i0 + 2], src[i0 + 3]];
    const tol = 40;
    const match = (i) => Math.abs(src[i] - t[0]) + Math.abs(src[i + 1] - t[1]) + Math.abs(src[i + 2] - t[2]) + Math.abs(src[i + 3] - t[3]) <= tol;
    const mask = new Uint8Array(W * H);
    const stack = [x0, y0];
    while (stack.length) {
      const y = stack.pop(); let x = stack.pop();
      while (x >= 0 && !mask[y * W + x] && match((y * W + x) * 4)) x--;
      x++;
      let up = false, dn = false;
      while (x < W && !mask[y * W + x] && match((y * W + x) * 4)) {
        mask[y * W + x] = 1;
        if (y > 0) { const m = !mask[(y - 1) * W + x] && match(((y - 1) * W + x) * 4); if (m && !up) { stack.push(x, y - 1); up = true; } else if (!m) up = false; }
        if (y < H - 1) { const m = !mask[(y + 1) * W + x] && match(((y + 1) * W + x) * 4); if (m && !dn) { stack.push(x, y + 1); dn = true; } else if (!m) dn = false; }
        x++;
      }
    }
    pushUndo(snapLayer());
    const L = cur(), img = L.ctx.getImageData(0, 0, W, H), d = img.data;
    const [r, g, b] = hexToRgb(S.color), a = Math.round(S.opacity * 255);
    // grow mask by 1px so anti-aliased edges don't leave a halo
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const hit = mask[k] || (x > 0 && mask[k - 1]) || (x < W - 1 && mask[k + 1]) || (y > 0 && mask[k - W]) || (y < H - 1 && mask[k + W]);
      if (!hit) continue;
      const j = k * 4;
      if (a === 255 || d[j + 3] === 0) { d[j] = r; d[j + 1] = g; d[j + 2] = b; d[j + 3] = Math.max(a, mask[k] ? a : d[j + 3]); }
      else { const f = a / 255; d[j] = d[j] * (1 - f) + r * f; d[j + 1] = d[j + 1] * (1 - f) + g * f; d[j + 2] = d[j + 2] * (1 - f) + b * f; d[j + 3] = Math.min(255, d[j + 3] + a); }
    }
    L.ctx.putImageData(img, 0, 0); render();
  }

  function contrast(hex) { const [r, g, b] = hexToRgb(hex); return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#000000' : '#ffffff'; }
  function drawText(ctx, text, x, y, px, font, color, outline) {
    ctx.save();
    ctx.font = `bold ${px}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.fillStyle = color;
    const lines = text.split('\n'), lh = px * 1.1;
    lines.forEach((ln, i) => {
      const yy = y + (i - (lines.length - 1) / 2) * lh;
      if (outline) { ctx.strokeStyle = contrast(color); ctx.lineWidth = Math.max(2, px / 8); ctx.strokeText(ln, x, yy); }
      ctx.fillText(ln, x, yy);
    });
    ctx.restore();
  }
  async function placeText(p) {
    const defSize = Math.max(12, Math.round(Math.min(S.W, S.H) / 10));
    const ok = await modal('Add text',
      `<label class="field col">Text <textarea id="tt" rows="3" style="background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:8px"></textarea></label>
       <label class="field">Size (px) <input id="ts" type="number" min="6" max="1000" value="${defSize}"></label>
       <p class="hint">Text is centered where you clicked. Uses the color, font and outline from the left panel.</p>`, { ok: 'Add' });
    const text = ok && $('#tt').value.trim();
    if (!text) return;
    pushUndo(snapLayer());
    cur().ctx.globalAlpha = S.opacity;
    drawText(cur().ctx, text, p.x, p.y, +$('#ts').value || defSize, $('#font').value, S.color, $('#textStroke').checked);
    cur().ctx.globalAlpha = 1;
    render();
  }

  // ---------- generators ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  }
  function makePalette(mode) {
    const h = rand(0, 360);
    switch (mode) {
      case 'analogous': return [-40, -20, 0, 20, 40].map((d, i) => hsl(h + d, rand(55, 85), 35 + i * 10));
      case 'complementary': return [hsl(h, 75, 30), hsl(h, 70, 50), hsl(h, 40, 85), hsl(h + 180, 70, 50), hsl(h + 180, 75, 30)];
      case 'triadic': return [hsl(h, 75, 50), hsl(h + 120, 75, 50), hsl(h + 240, 75, 50), hsl(h, 40, 90), hsl(h + 120, 50, 20)];
      case 'pastel': return [0, 1, 2, 3, 4].map(() => hsl(rand(0, 360), rand(60, 90), rand(78, 88)));
      case 'neon': return [0, 72, 144, 216, 288].map((d) => hsl(h + d, 100, 55));
      case 'mono': return [20, 35, 50, 65, 80].map((l) => hsl(h, rand(50, 80), l));
      default: return [0, 1, 2, 3, 4].map(() => hsl(rand(0, 360), rand(45, 95), rand(25, 75)));
    }
  }
  function renderPalette() {
    const box = $('#palette'); box.innerHTML = '';
    S.palette.forEach((c) => {
      const b = document.createElement('button'); b.style.background = c; b.title = c + ' (click to use)';
      b.onclick = () => { setColor(c); toast('Color ' + c); };
      box.appendChild(b);
    });
  }
  $('#genPalette').onclick = () => { S.palette = makePalette($('#palMode').value); renderPalette(); };

  function genOnLayer(fn) {
    pushUndo(snapLayer());
    const c = cur().ctx; c.save(); fn(c, S.W, S.H); c.restore(); render();
  }

  $('#genGradient').onclick = () => genOnLayer((c, W, H) => {
    const P = S.palette, type = $('#gradType').value;
    if (type === 'mesh') {
      c.fillStyle = P[0]; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 7; i++) {
        const x = rand(0, W), y = rand(0, H), r = rand(.35, .8) * Math.max(W, H);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        const col = P[ri(1, P.length - 1)];
        g.addColorStop(0, col + 'ee'); g.addColorStop(1, col + '00');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      return;
    }
    let g;
    if (type === 'radial') g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
    else { const a = rand(0, Math.PI * 2), r = Math.hypot(W, H) / 2; g = c.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r); }
    const n = ri(2, 4);
    for (let i = 0; i < n; i++) g.addColorStop(i / (n - 1), P[i % P.length]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  });

  function star(c, x, y, r, pts = 5) {
    c.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const rr = i % 2 ? r * .45 : r, a = (i * Math.PI) / pts - Math.PI / 2;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }
  $('#genPattern').onclick = () => genOnLayer((c, W, H) => {
    const P = S.palette, type = $('#patType').value, u = Math.max(4, Math.round(Math.min(W, H) / ri(8, 16)));
    const bg = P[0], fg = P.slice(1);
    if (type !== 'confetti' && type !== 'stars') { c.fillStyle = bg; c.fillRect(0, 0, W, H); }
    else { c.fillStyle = bg; c.fillRect(0, 0, W, H); }
    switch (type) {
      case 'dots':
        for (let y = 0, row = 0; y < H + u; y += u, row++)
          for (let x = (row % 2) * u / 2; x < W + u; x += u) { c.fillStyle = fg[row % fg.length]; c.beginPath(); c.arc(x, y, u * .28, 0, 7); c.fill(); }
        break;
      case 'stripes': {
        c.save(); c.translate(W / 2, H / 2); c.rotate(pick([0, Math.PI / 4, -Math.PI / 4, Math.PI / 2]));
        const R = Math.hypot(W, H);
        for (let x = -R, i = 0; x < R; x += u / 2, i++) { c.fillStyle = i % 2 ? bg : fg[(i >> 1) % fg.length]; c.fillRect(x, -R, u / 2, R * 2); }
        c.restore(); break;
      }
      case 'checker':
        for (let y = 0; y < H; y += u) for (let x = 0; x < W; x += u)
          if (((x / u) + (y / u)) % 2 === 0) { c.fillStyle = fg[0]; c.fillRect(x, y, u, u); }
        break;
      case 'waves':
        c.lineWidth = u / 4; c.lineCap = 'round';
        for (let y = 0, i = 0; y < H + u; y += u / 1.5, i++) {
          c.strokeStyle = fg[i % fg.length]; c.beginPath();
          for (let x = 0; x <= W; x += 4) c.lineTo(x, y + Math.sin(x / u * 2) * u / 3);
          c.stroke();
        }
        break;
      case 'confetti':
        for (let i = 0; i < (W * H) / (u * u) * 3; i++) {
          c.save(); c.translate(rand(0, W), rand(0, H)); c.rotate(rand(0, 6.3)); c.fillStyle = pick(fg);
          if (Math.random() < .5) c.fillRect(-u / 6, -u / 16, u / 3, u / 8); else { c.beginPath(); c.arc(0, 0, u / 10, 0, 7); c.fill(); }
          c.restore();
        }
        break;
      case 'stars':
        for (let i = 0; i < (W * H) / (u * u) * 1.2; i++) { c.fillStyle = pick(fg); star(c, rand(0, W), rand(0, H), rand(u * .1, u * .35)); c.fill(); }
        break;
      case 'triangles':
        for (let y = 0, r = 0; y < H; y += u, r++) for (let x = -u, k = 0; x < W + u; x += u / 2, k++) {
          c.fillStyle = pick([bg, ...fg]); c.beginPath();
          if ((k + r) % 2) { c.moveTo(x, y); c.lineTo(x + u, y); c.lineTo(x + u / 2, y + u); }
          else { c.moveTo(x + u / 2, y); c.lineTo(x + u, y + u); c.lineTo(x, y + u); }
          c.closePath(); c.fill();
        }
        break;
      case 'noise': {
        const px = pixelMode() ? 1 : Math.max(2, Math.round(u / 4));
        for (let y = 0; y < H; y += px) for (let x = 0; x < W; x += px) { c.fillStyle = pick(P); c.fillRect(x, y, px, px); }
        break;
      }
    }
  });

  $('#genArt').onclick = () => genOnLayer((c, W, H) => {
    const P = S.palette, type = $('#artType').value, M = Math.min(W, H);
    switch (type) {
      case 'circles':
        for (let i = 0; i < 60; i++) {
          c.globalAlpha = rand(.3, .9); c.fillStyle = pick(P);
          c.beginPath(); c.arc(rand(0, W), rand(0, H), rand(M * .02, M * .18), 0, 7); c.fill();
        }
        break;
      case 'lines': {
        c.lineCap = 'round';
        const seed = rand(0, 100);
        for (let i = 0; i < 160; i++) {
          let x = rand(0, W), y = rand(0, H);
          c.strokeStyle = pick(P); c.lineWidth = rand(1, M / 120 + 1); c.globalAlpha = rand(.4, 1);
          c.beginPath(); c.moveTo(x, y);
          for (let s = 0; s < 60; s++) {
            const a = (Math.sin(x / M * 3 + seed) + Math.cos(y / M * 3 - seed)) * Math.PI;
            x += Math.cos(a) * M / 80; y += Math.sin(a) * M / 80; c.lineTo(x, y);
          }
          c.stroke();
        }
        break;
      }
      case 'mondrian': {
        const split = (x, y, w, h, d) => {
          if (d > 4 || (d > 1 && Math.random() < .25) || w < M / 12 || h < M / 12) {
            c.fillStyle = Math.random() < .6 ? '#f5f1e8' : pick(P); c.fillRect(x, y, w, h);
            c.strokeStyle = '#111'; c.lineWidth = Math.max(2, M / 90); c.strokeRect(x, y, w, h); return;
          }
          if (w > h) { const s = w * rand(.3, .7); split(x, y, s, h, d + 1); split(x + s, y, w - s, h, d + 1); }
          else { const s = h * rand(.3, .7); split(x, y, w, s, d + 1); split(x, y + s, w, h - s, d + 1); }
        };
        split(0, 0, W, H, 0); break;
      }
      case 'pixelcreature': {
        const n = 12, cell = Math.floor(M * .7 / n), ox = (W - cell * n) / 2, oy = (H - cell * n) / 2;
        const body = pick(P.slice(1)), dark = '#111';
        const g = [];
        for (let y = 0; y < n; y++) { g[y] = []; for (let x = 0; x < n / 2; x++) g[y][x] = Math.random() < (.15 + .6 * (1 - Math.abs(y - n / 2) / (n / 2))) * (x > 0 ? 1 : .4) ? 1 : 0; }
        const eyeY = ri(3, 5), eyeX = ri(2, 4);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          const v = g[y][x < n / 2 ? n / 2 - 1 - (n / 2 - 1 - x) : n - 1 - x];
          const mx = x < n / 2 ? x : n - 1 - x;
          if (!g[y][mx]) continue;
          c.fillStyle = (y === eyeY && (x === n / 2 - eyeX || x === n / 2 + eyeX - 1)) ? dark : body;
          c.fillRect(ox + x * cell, oy + y * cell, cell, cell);
          void v;
        }
        // eyes always visible
        c.fillStyle = '#fff';
        [n / 2 - eyeX, n / 2 + eyeX - 1].forEach((x) => { c.fillRect(ox + x * cell, oy + eyeY * cell, cell, cell); c.fillStyle = dark; c.fillRect(ox + x * cell + cell / 4, oy + eyeY * cell + cell / 4, cell / 2, cell / 2); c.fillStyle = '#fff'; });
        break;
      }
      case 'galaxy': {
        c.fillStyle = '#05030f'; c.fillRect(0, 0, W, H);
        for (let i = 0; i < 4; i++) {
          const x = rand(0, W), y = rand(0, H), r = rand(.3, .7) * M, col = pick(P);
          const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col + '88'); g.addColorStop(1, col + '00');
          c.fillStyle = g; c.fillRect(0, 0, W, H);
        }
        for (let i = 0; i < W * H / 400; i++) { c.globalAlpha = rand(.3, 1); c.fillStyle = '#fff'; c.fillRect(rand(0, W), rand(0, H), rand(.5, 2.2), rand(.5, 2.2)); }
        c.globalAlpha = 1;
        for (let i = 0; i < 6; i++) { c.fillStyle = '#fff'; star(c, rand(0, W), rand(0, H), rand(M * .006, M * .016), 4); c.fill(); }
        break;
      }
    }
  });

  const PROMPT = {
    who: ['a sleepy dragon', 'a robot chef', 'a cat astronaut', 'a tiny wizard', 'a skateboarding frog', 'a ghost DJ', 'a knight made of candy',
      'a cyberpunk fox', 'a mushroom village', 'a giant jellyfish', 'a samurai penguin', 'a lost alien', 'a haunted vending machine', 'a cloud whale'],
    doing: ['eating ramen', 'fighting a storm', 'reading a glowing book', 'building a castle', 'surfing a rainbow', 'hiding from the rain',
      'opening a mystery box', 'racing through a city', 'having a tea party', 'painting the stars', 'guarding a treasure', 'flying a paper plane'],
    where: ['on the moon', 'under the ocean', 'inside a snow globe', 'in a neon alley', 'on top of a volcano', 'in a candy forest',
      'in a floating island', 'in a retro arcade', 'at a haunted carnival', 'in a jungle temple'],
    style: ['pixel art', 'only 3 colors', 'neon glow', 'cute chibi style', 'comic book style', 'pastel dreamy style', 'black & white ink', 'sticker style with thick outlines']
  };
  $('#genPrompt').onclick = () => {
    $('#prompt').textContent = `Draw ${pick(PROMPT.who)} ${pick(PROMPT.doing)} ${pick(PROMPT.where)}: ${pick(PROMPT.style)}.`;
  };

  // ---------- guides (overlay only, never exported) ----------
  const GUIDES = {
    circle(c, px) {
      c.strokeStyle = 'rgba(255,61,127,.9)'; c.lineWidth = 2 * px; c.setLineDash([8 * px, 6 * px]);
      c.beginPath(); c.arc(S.W / 2, S.H / 2, Math.min(S.W, S.H) / 2, 0, 7); c.stroke();
    },
    thumb(c, px) {
      c.strokeStyle = 'rgba(255,61,127,.9)'; c.lineWidth = 2 * px; c.setLineDash([8 * px, 6 * px]);
      // YouTube timestamp area (bottom-right)
      c.strokeRect(S.W - 190, S.H - 70, 170, 50);
      c.font = 'bold 18px system-ui'; c.fillStyle = 'rgba(255,61,127,.9)'; c.textAlign = 'right';
      c.fillText('video length covers this', S.W - 20, S.H - 78);
    },
    phone(c, px) {
      c.strokeStyle = 'rgba(255,61,127,.9)'; c.lineWidth = 2 * px; c.setLineDash([8 * px, 6 * px]);
      c.strokeRect(0, 0, S.W, S.H * .22); c.strokeRect(0, S.H * .86, S.W, S.H * .14);
      c.font = `${30}px system-ui`; c.fillStyle = 'rgba(255,61,127,.9)';
      c.fillText('clock area', 20, S.H * .22 - 14); c.fillText('dock / buttons', 20, S.H * .86 + 40);
    },
    shirt(c, px) {
      // Roblox classic shirt template regions
      const R = [
        ['UP', 231, 8, 128, 64], ['L', 165, 74, 64, 128], ['FRONT', 231, 74, 128, 128], ['R', 361, 74, 64, 128], ['BACK', 427, 74, 128, 128], ['DOWN', 231, 204, 128, 64],
        ['UP', 217, 289, 64, 64], ['L', 19, 355, 64, 128], ['B', 85, 355, 64, 128], ['R', 151, 355, 64, 128], ['F', 217, 355, 64, 128], ['DN', 217, 485, 64, 64],
        ['UP', 308, 289, 64, 64], ['F', 308, 355, 64, 128], ['L', 374, 355, 64, 128], ['B', 440, 355, 64, 128], ['R', 506, 355, 64, 128], ['DN', 308, 485, 64, 64]
      ];
      c.lineWidth = 1.5 * px; c.strokeStyle = 'rgba(124,77,255,.95)'; c.fillStyle = 'rgba(124,77,255,.95)';
      c.font = `bold 11px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
      R.forEach(([t, x, y, w, h]) => { c.strokeRect(x, y, w, h); c.fillText(t, x + w / 2, y + h / 2); });
      c.font = 'bold 13px system-ui';
      c.fillText('TORSO', 295, 282 - 14); c.fillText('RIGHT ARM', 117, 540); c.fillText('LEFT ARM', 472, 540);
    }
  };

  // ---------- templates ----------
  const TEMPLATES = [
    { id: 'thumb', name: 'YouTube thumbnail', size: '1280×720', make() {
      resetDoc(1280, 720); S.layers[0].ctx.save(); gradientBg(S.layers[0].ctx, 1280, 720); S.layers[0].ctx.restore();
      const t = S.layers[1]; t.name = 'Title';
      drawText(t.ctx, 'YOUR BIG\nTITLE HERE', 420, 360, 120, "Impact, 'Arial Black', sans-serif", '#ffffff', true);
      S.layers.push(newLayer('Drawing')); S.active = 2; S.guides = 'thumb';
    } },
    { id: 'poster', name: 'Poster / flyer', size: '1080×1350', make() {
      resetDoc(1080, 1350); gradientBg(S.layers[0].ctx, 1080, 1350);
      const t = S.layers[1]; t.name = 'Text';
      drawText(t.ctx, 'EVENT NAME', 540, 220, 130, "Impact, 'Arial Black', sans-serif", '#ffffff', true);
      drawText(t.ctx, 'Saturday · 7 PM · Place', 540, 1180, 56, "'Arial Black', Arial, sans-serif", '#ffffff', true);
      S.layers.push(newLayer('Drawing')); S.active = 2;
    } },
    { id: 'pfp', name: 'Profile picture', size: '1024×1024', make() {
      resetDoc(1024, 1024); gradientBg(S.layers[0].ctx, 1024, 1024, 'radial'); S.guides = 'circle';
    } },
    { id: 'ig', name: 'Instagram post', size: '1080×1080', make() { resetDoc(1080, 1080, '#ffffff'); } },
    { id: 'wall', name: 'Phone wallpaper / Story', size: '1080×1920', make() {
      resetDoc(1080, 1920); meshBg(S.layers[0].ctx, 1080, 1920); S.guides = 'phone';
    } },
    { id: 'desk', name: 'Desktop wallpaper', size: '1920×1080', make() { resetDoc(1920, 1080); meshBg(S.layers[0].ctx, 1920, 1080); } },
    { id: 'meme', name: 'Meme', size: '1080×1080', make() {
      resetDoc(1080, 1080, '#808080');
      S.layers[1].name = 'Picture';
      const t = newLayer('Meme text'); S.layers.push(t); S.active = 2;
      drawText(t.ctx, 'TOP TEXT', 540, 110, 110, "Impact, 'Arial Black', sans-serif", '#ffffff', true);
      drawText(t.ctx, 'BOTTOM TEXT', 540, 970, 110, "Impact, 'Arial Black', sans-serif", '#ffffff', true);
      S.active = 1;
      setTimeout(() => toast('Click Image to add your picture, then edit the text layer'), 300);
    } },
    { id: 'shirt', name: 'Roblox classic shirt', size: '585×559', make() {
      resetDoc(585, 559); S.guides = 'shirt'; S.layers[0].name = 'Shirt'; S.active = 0; S.layers.splice(1, 1);
      setTimeout(() => toast('The outlined boxes are guides only, they won\'t export. Paint inside them.'), 300);
    } },
    { id: 'banner', name: 'Discord / Twitch banner', size: '960×540', make() { resetDoc(960, 540); gradientBg(S.layers[0].ctx, 960, 540); } },
    { id: 'px32', name: 'Pixel art 32×32', size: '32×32', make() { resetDoc(32, 32); } },
    { id: 'px64', name: 'Pixel art 64×64', size: '64×64', make() { resetDoc(64, 64); } },
    { id: 'emote', name: 'Emote / sticker', size: '512×512', make() { resetDoc(512, 512); S.guides = 'circle'; } },
    { id: 'blank', name: 'Blank canvas', size: 'any size', make: () => newCanvasDialog() }
  ];
  function gradientBg(c, W, H, type) {
    const P = makePalette(pick(['analogous', 'neon', 'complementary']));
    const g = type === 'radial' ? c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2)
      : c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, P[0]); g.addColorStop(1, P[3]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  function meshBg(c, W, H) {
    const P = makePalette(pick(['pastel', 'analogous', 'neon']));
    c.fillStyle = P[0]; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) {
      const x = rand(0, W), y = rand(0, H), r = rand(.4, .9) * Math.max(W, H), col = P[1 + (i % 4)];
      const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col + 'dd'); g.addColorStop(1, col + '00');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
  }
  function renderTemplates() {
    const box = $('#tplList'); box.innerHTML = '';
    TEMPLATES.forEach((t) => {
      const b = document.createElement('button'); b.className = 'tpl';
      b.innerHTML = `<span><b>${t.name}</b><small>${t.size}</small></span>`;
      b.onclick = async () => {
        if (S.dirty && t.id !== 'blank') {
          const ok = await modal('Start a new template?', '<p>This replaces what\'s on the canvas now. Save or export first if you want to keep it.</p>', { ok: 'Replace it' });
          if (!ok) return;
        }
        const before = undoStack.length ? snapAll() : null;
        t.make();
        if (t.id !== 'blank') {
          if (before) undoStack.push(before); // so Undo can bring old art back
          S.title = safeName(t.name).toLowerCase().replace(/\s+/g, '-');
          fit(); renderLayers(); render(); changed();
        }
      };
      box.appendChild(b);
    });
  }
  $$('.subtab').forEach((b) => (b.onclick = () => {
    $$('.subtab').forEach((x) => x.classList.toggle('active', x === b));
    $('#sub-gen').hidden = b.dataset.sub !== 'gen'; $('#sub-tpl').hidden = b.dataset.sub !== 'tpl';
  }));

  async function newCanvasDialog() {
    const ok = await modal('New canvas',
      `<div class="row"><label class="field">Width <input id="nw" type="number" min="8" max="4096" value="${S.W}" style="width:90px"></label>
       <label class="field">Height <input id="nh" type="number" min="8" max="4096" value="${S.H}" style="width:90px"></label></div>
       <label class="field">Background <select id="nbg"><option value="#ffffff">White</option><option value="">See-through</option><option value="#000000">Black</option><option value="cur">Current color</option></select></label>
       <p class="hint">Your current art will be replaced. Save it first if you want to keep it.</p>`, { ok: 'Create' });
    if (!ok) return;
    const w = Math.max(8, Math.min(4096, +$('#nw').value || 800)), h = Math.max(8, Math.min(4096, +$('#nh').value || 600));
    let bg = $('#nbg').value; if (bg === 'cur') bg = S.color;
    const before = snapAll();
    resetDoc(w, h, bg || null);
    undoStack.push(before);
    S.title = 'my-art';
  }
  $('#newCanvas').onclick = newCanvasDialog;

  // ---------- save / open / import / export / share ----------
  function toBlob(canvas) { return new Promise((r) => canvas.toBlob(r, 'image/png')); }

  function projectData() {
    return {
      app: 'free-studio', kind: 'art', version: 1, title: S.title, W: S.W, H: S.H, active: S.active, guides: S.guides, palette: S.palette,
      layers: S.layers.map((L) => ({ name: L.name, visible: L.visible, png: L.canvas.toDataURL('image/png') }))
    };
  }
  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
  async function loadProject(d, { silent } = {}) {
    if (!d || !d.layers || !d.W) { toast('That art file looks broken.'); return; }
    const imgs = await Promise.all(d.layers.map((l) => loadImg(l.png)));
    const before = S.layers.length ? snapAll() : null;
    resetDoc(d.W, d.H);
    S.layers = d.layers.map((l, i) => { const L = newLayer(l.name); L.visible = l.visible !== false; L.ctx.drawImage(imgs[i], 0, 0); return L; });
    S.active = Math.min(d.active || 0, S.layers.length - 1);
    S.guides = d.guides || null; S.title = d.title || 'my-art';
    if (Array.isArray(d.palette)) { S.palette = d.palette; renderPalette(); }
    if (before && !silent) undoStack.push(before);
    fit(); renderLayers(); render();
    if (!silent) { changed(); toast('Art opened'); } else S.dirty = false;
  }

  async function exportPNG() {
    const blob = await toBlob(flatten());
    download(safeName(S.title, 'my-art') + '.png', blob);
    toast('PNG downloaded');
  }
  $('#exportPng').onclick = exportPNG;

  async function saveProject() {
    download(safeName(S.title, 'my-art') + '.fsart', JSON.stringify(projectData()), 'application/json');
    toast('Project saved. Open it later with Open file to keep editing layers.');
  }

  async function importImage(file) {
    if (!file || !/^image\//.test(file.type)) return toast('Pick an image file (PNG, JPG, GIF, WebP)');
    let img;
    try { img = await loadImg(await readDataURL(file)); } catch (e) { return toast('Couldn\'t open that image'); }
    const L = addLayer(safeName(file.name.replace(/\.[^.]+$/, ''), 'Image'));
    const s = Math.min(S.W / img.width, S.H / img.height, 1) || 1;
    const w = img.width * s, h = img.height * s;
    L.ctx.imageSmoothingEnabled = !pixelMode();
    L.ctx.drawImage(img, (S.W - w) / 2, (S.H - h) / 2, w, h);
    render(); toast('Image added as a new layer');
  }

  async function shareArt() {
    const blob = await toBlob(flatten());
    const file = new File([blob], safeName(S.title, 'my-art') + '.png', { type: 'image/png' });
    if (await shareFile(file, S.title)) return;
    download(file.name, blob);
    modal('Send it to yourself',
      `<p>Your browser can't open the share menu here, so the PNG was downloaded instead.</p>
       <p>To get it on another device: attach it to an email to yourself, upload it to Google Drive / iCloud, or AirDrop it.</p>
       <p class="hint">On phones, Share opens the normal share menu (Messages, Drive, AirDrop, Discord…).</p>`, { cancel: null });
  }

  // extra buttons in the stage bar
  const bar = $('.stage-bar');
  const extra = document.createElement('span'); extra.className = 'row';
  extra.innerHTML = `<button class="btn sm" id="artImport" title="Add a picture as a new layer">Image</button>
    <button class="btn sm" id="artOpen" title="Open a saved .fsart project">Open</button>
    <button class="btn sm" id="artSave" title="Save project with layers (.fsart)">Save</button>
    <button class="btn sm" id="artShare" title="Send the picture to yourself or a friend">Share</button>`;
  bar.insertBefore(extra, $('#exportPng'));
  $('#artImport').onclick = async () => importImage(await pickFile('image/*'));
  $('#artOpen').onclick = async () => { const f = await pickFile('.fsart,.json,application/json'); if (f) window.FS.openAnyFile(f); };
  $('#artSave').onclick = saveProject;
  $('#artShare').onclick = shareArt;

  // drag & drop + paste
  stage.addEventListener('dragover', (e) => { e.preventDefault(); });
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0]; if (!f) return;
    if (/^image\//.test(f.type)) importImage(f); else window.FS.openAnyFile(f);
  });
  document.addEventListener('paste', (e) => {
    if ($('#view-art').hidden || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); importImage(item.getAsFile()); }
  });

  // ---------- autosave (IndexedDB, falls back silently) ----------
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('free-studio', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  async function idbSet(k, v) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function idbGet(k) { const d = await db(); return new Promise((res, rej) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

  let saveTimer;
  function changed() {
    S.dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { idbSet('art', projectData()).catch(() => {}); }, 1200);
  }

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if ($('#view-art').hidden || !$('#modal').hidden) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 's') { e.preventDefault(); saveProject(); return; }
    if (mod) return;
    const map = { b: 'brush', e: 'eraser', l: 'line', r: 'rect', o: 'ellipse', f: 'fill', t: 'text', i: 'picker' };
    if (map[k]) setTool(map[k]);
    if (k === '[') setSize(Math.max(1, S.size - (S.size > 10 ? 4 : 1)));
    if (k === ']') setSize(Math.min(120, S.size + (S.size >= 10 ? 4 : 1)));
  });

  // ---------- backup hook ----------
  window.FS.registerBackup('art', { export: async () => projectData(), import: (d) => loadProject(d) });

  // ---------- init ----------
  renderSwatches(); renderPalette(); renderTemplates(); setTool('brush');
  resetDoc(1280, 720, '#ffffff'); S.dirty = false;
  idbGet('art').then((d) => { if (d && d.layers) loadProject(d, { silent: true }); }).catch(() => {});

  window.FS.art = { loadProject, importImage };
})();
