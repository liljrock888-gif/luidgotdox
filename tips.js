/* LuidgotDOx: animated comic tip bubbles.
   A short guided tour runs the first time someone opens each page, and the "Tips" button replays it. */
(function () {
  'use strict';
  const { $, store } = window.FS;

  const TOURS = {
    home: [
      ['.brand', 'Welcome to LuidgotDOx! Everything here is free. No account needed.'],
      ['.hero-cards .card:nth-child(1)', 'Draw, design thumbnails, memes, wallpapers and Roblox shirts in the Art Studio.'],
      ['.hero-cards .card:nth-child(2)', 'Write essays with ready-made templates and MLA / APA formatting.'],
      ['#installBtn', 'Install LuidgotDOx as an app. It works offline too!'],
      ['#backupBtn', 'Your work saves in this browser. Backup all downloads everything as one file.'],
      ['.help-fab', 'Stuck? Ask the helper anything, any time.']
    ],
    art: [
      ['#tools', 'Pick a tool here. Shortcuts: B brush, E eraser, [ and ] change size.'],
      ['#swatches', 'Click a color, or use the color box above for any color you want.'],
      ['#layers', 'Layers keep things separate. Draw on one without messing up the others.'],
      ['.subtab[data-sub="gen"]', 'Generators make palettes, patterns, gradients and random art in one click.'],
      ['.subtab[data-sub="tpl"]', 'Templates set up the right size for thumbnails, memes, PFPs and more.'],
      ['#artImport', 'Add your own picture. You can also drag it in or paste it.'],
      ['#artSave', 'Save keeps all your layers so you can keep editing later.'],
      ['#exportPng', 'Done? Export a PNG to post or share it.']
    ],
    essay: [
      ['#newDoc', 'Start a new essay. All your essays are listed below it.'],
      ['#essayTpls', 'Pick a template. It fills in the outline for you.'],
      ['#paper', 'Click a highlighted [box] and type to replace it with your writing.'],
      ['#styleMode', 'Switch to MLA or APA for school formatting.'],
      ['#insertHeading', 'Fill in your name and class, then add the heading in one click.'],
      ['#goal', 'Set a word goal and watch the bar fill up.'],
      ['#eSend', 'Email it to yourself, share it, or copy a link that holds your essay.'],
      ['#dlDoc', 'Download it for Word or Google Docs, or as a PDF.']
    ]
  };

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let bubble = null, ring = null, steps = [], idx = 0, typer = null, view = null;

  function visible(el) {
    if (!el || el.hidden) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  function build() {
    ring = document.createElement('div'); ring.className = 'tip-ring'; ring.setAttribute('aria-hidden', 'true');
    bubble = document.createElement('div'); bubble.className = 'tip-bubble'; bubble.setAttribute('role', 'dialog'); bubble.setAttribute('aria-live', 'polite');
    bubble.innerHTML = `<div class="tip-text"></div>
      <div class="tip-foot"><span class="tip-count"></span><span class="spacer"></span>
      <button class="tip-skip" type="button">Skip</button><button class="tip-next" type="button">Next</button></div>
      <span class="tip-tail"></span>`;
    document.body.append(ring, bubble);
    bubble.querySelector('.tip-next').onclick = next;
    bubble.querySelector('.tip-skip').onclick = end;
  }

  function place() {
    if (!bubble || !steps[idx]) return;
    const el = steps[idx][0];
    if (!visible(el)) return;
    const r = el.getBoundingClientRect(), pad = 6, gap = 18;
    Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight, vw = innerWidth, vh = innerHeight;
    let below = r.bottom + gap + bh < vh - 8 || r.top - gap - bh < 8;
    // big targets (like the page): put the bubble inside, near the top
    let top = below ? r.bottom + gap : r.top - gap - bh;
    if (r.height > vh * .6) { top = Math.max(r.top, 70) + 40; below = true; }
    top = Math.max(8, Math.min(top, vh - bh - 8));
    const cx = r.left + r.width / 2;
    const left = Math.max(8, Math.min(cx - bw / 2, vw - bw - 8));
    bubble.style.left = left + 'px'; bubble.style.top = top + 'px';
    bubble.classList.toggle('above', !below);
    const tail = Math.max(22, Math.min(cx - left, bw - 22));
    bubble.style.setProperty('--tail-x', tail + 'px');
  }

  function typeText(t) {
    const box = bubble.querySelector('.tip-text');
    clearInterval(typer);
    if (reduce) { box.textContent = t; return; }
    box.textContent = ''; box.setAttribute('aria-label', t);
    let i = 0;
    typer = setInterval(() => { i += 2; box.textContent = t.slice(0, i); if (i >= t.length) clearInterval(typer); place(); }, 18);
  }

  function show() {
    const [el, text] = steps[idx];
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    bubble.classList.remove('pop'); ring.classList.remove('pop');
    void bubble.offsetWidth; // restart animation
    bubble.classList.add('pop'); ring.classList.add('pop');
    bubble.querySelector('.tip-count').textContent = `${idx + 1} / ${steps.length}`;
    bubble.querySelector('.tip-next').textContent = idx === steps.length - 1 ? 'Got it!' : 'Next';
    // reserve the full text size first so the bubble doesn't jump while typing
    bubble.querySelector('.tip-text').textContent = text;
    place();
    typeText(text);
    bubble.querySelector('.tip-next').focus({ preventScroll: true });
    setTimeout(place, 350);
  }

  function next() {
    if (idx < steps.length - 1) {
      bubble.classList.add('out');
      setTimeout(() => { bubble.classList.remove('out'); idx++; show(); }, reduce ? 0 : 160);
    } else end();
  }

  function end() {
    if (!bubble) return;
    clearInterval(typer);
    bubble.classList.add('out'); ring.classList.add('out');
    const b = bubble, r = ring;
    bubble = ring = null; steps = [];
    setTimeout(() => { b.remove(); r.remove(); }, reduce ? 0 : 200);
    if (view) store.set('tour:' + view, true);
    document.removeEventListener('keydown', key, true);
  }

  function key(e) {
    if (!$('#modal').hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); end(); }
    else if ((e.key === 'ArrowRight' || e.key === 'Enter') && document.activeElement && document.activeElement.closest('.tip-bubble')) { e.preventDefault(); next(); }
  }

  function start(v) {
    end();
    view = v;
    steps = (TOURS[v] || []).map(([sel, t]) => [$(sel), t]).filter(([el]) => visible(el));
    if (!steps.length) return;
    idx = 0; build(); show();
    document.addEventListener('keydown', key, true);
  }

  addEventListener('resize', place);
  addEventListener('scroll', place, true);

  // replay button in the top bar
  const btn = document.createElement('button');
  btn.className = 'btn sm'; btn.id = 'tipsBtn'; btn.textContent = 'Tips'; btn.title = 'Show tips for this page';
  $('#backupBtn').before(btn);
  btn.onclick = () => start(store.get('view', 'home'));

  // first visit to each page: run its tour once
  ['home', 'art', 'essay'].forEach((v) => window.FS.onShow(v, () => {
    if (store.get('tour:' + v, false) || navigator.webdriver) return;
    setTimeout(() => { if (store.get('view') === v && !bubble && $('#modal').hidden) start(v); }, 700);
  }));

  window.FS.tips = { start, end };
})();
