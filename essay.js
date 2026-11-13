/* LuidgotDOx — Essay Writer */
(function () {
  'use strict';
  const { $, $$, store, toast, modal, download, pickFile, safeName, shareFile, packText, unpackText, copy, loadScript } = window.FS;
  const paper = $('#paper');

  // ---------- sanitizer (everything that enters the editor goes through here) ----------
  const ALLOWED = new Set(['P', 'H1', 'H2', 'H3', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'BR', 'DIV', 'SPAN', 'SUP', 'SUB']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'svg', 'SVG', 'MATH', 'META', 'LINK', 'HEAD', 'TITLE', 'NOSCRIPT', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT']);
  function sanitize(html) {
    const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) return;
        if (n.nodeType !== 1) { n.remove(); return; }
        if (DROP.has(n.tagName)) { n.remove(); return; }
        walk(n);
        if (!ALLOWED.has(n.tagName)) { n.replaceWith(...n.childNodes); return; }
        const keepPh = n.tagName === 'SPAN' && n.classList.contains('ph');
        const keepHb = n.tagName === 'DIV' && n.classList.contains('heading-block');
        const align = n.style && n.style.textAlign;
        Array.from(n.attributes).forEach((a) => n.removeAttribute(a.name));
        if (keepPh) n.className = 'ph';
        if (keepHb) n.className = 'heading-block';
        if (align && /^(left|right|center|justify)$/.test(align)) n.style.textAlign = align;
        if (n.tagName === 'SPAN' && !keepPh) n.replaceWith(...n.childNodes);
      });
    };
    walk(doc.body);
    return doc.body.innerHTML;
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const textToHtml = (t) => t.replace(/\r\n?/g, '\n').split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('') || '<p><br></p>';

  // ---------- documents ----------
  let docs = store.get('essays', []);
  let curId = store.get('essayCur', null);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const curDoc = () => docs.find((d) => d.id === curId);

  function titleOf(html) {
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const h = tmp.querySelector('h1'); const t = (h ? h.textContent : tmp.textContent).trim().split('\n')[0];
    return (/^\[.*\]$/.test(t) ? '' : t.slice(0, 60)) || 'Untitled essay';
  }
  function persist() {
    const ok = store.set('essays', docs); store.set('essayCur', curId);
    $('#saved').textContent = ok ? 'Saved' : 'Couldn\'t autosave: download a copy!';
  }
  function newDoc(html = '', extra = {}) {
    const d = { id: uid(), html, style: $('#styleMode').value || 'normal', goal: '', updated: Date.now(), ...extra };
    d.title = titleOf(d.html);
    docs.unshift(d); curId = d.id; persist(); openDoc(d.id);
    return d;
  }
  function openDoc(id) {
    const d = docs.find((x) => x.id === id); if (!d) return;
    curId = id;
    paper.innerHTML = sanitize(d.html);
    $('#styleMode').value = d.style || 'normal'; applyStyle();
    $('#goal').value = d.goal || '';
    renderList(); stats(); store.set('essayCur', curId);
  }
  function deleteDoc(id) {
    docs = docs.filter((d) => d.id !== id);
    if (curId === id) curId = docs[0] ? docs[0].id : null;
    persist();
    if (curId) openDoc(curId); else newDoc();
  }
  function renderList() {
    const ul = $('#docList'); ul.innerHTML = '';
    docs.forEach((d) => {
      const li = document.createElement('li'); li.className = d.id === curId ? 'active' : '';
      const when = new Date(d.updated).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      li.innerHTML = `<div class="t"><b></b><small>${when}</small></div><button class="x" title="Delete">Delete</button>`;
      li.querySelector('b').textContent = d.title;
      li.onclick = () => { saveNow(); openDoc(d.id); };
      li.querySelector('.x').onclick = async (e) => {
        e.stopPropagation();
        const ok = await modal('Delete this essay?', `<p><b>${esc(d.title)}</b> will be gone from this browser. This can't be undone.</p>`, { ok: 'Delete' });
        if (ok) deleteDoc(d.id);
      };
      ul.appendChild(li);
    });
  }

  let saveTimer;
  function saveNow() {
    const d = curDoc(); if (!d) return;
    d.html = paper.innerHTML; d.title = titleOf(d.html); d.updated = Date.now();
    d.style = $('#styleMode').value; d.goal = $('#goal').value;
    persist(); renderList();
  }
  function scheduleSave() { $('#saved').textContent = 'Saving…'; clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 600); }
  paper.addEventListener('input', () => { stats(); scheduleSave(); });
  window.addEventListener('beforeunload', saveNow);
  $('#newDoc').onclick = () => { saveNow(); newDoc(); paper.focus(); };

  // ---------- stats ----------
  function stats() {
    const text = paper.innerText || '';
    const words = (text.match(/[A-Za-z0-9À-ɏ'’-]+/g) || []).length;
    $('#wc').textContent = words.toLocaleString() + (words === 1 ? ' word' : ' words');
    $('#cc').textContent = text.replace(/\n/g, '').length.toLocaleString() + ' characters';
    $('#rt').textContent = Math.max(1, Math.round(words / 230)) + ' min read';
    const goal = +$('#goal').value;
    $('#goalFill').style.width = goal ? Math.min(100, (words / goal) * 100) + '%' : '0';
    $('#goalWrap').title = goal ? `${words} / ${goal} words` : 'Set a word goal';
  }
  $('#goal').oninput = () => { stats(); scheduleSave(); };

  // ---------- toolbar ----------
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
  $$('#etoolbar [data-cmd]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection
    b.onclick = () => { document.execCommand(b.dataset.cmd, false, null); paper.focus(); stats(); scheduleSave(); };
  });
  $('#blockFmt').onchange = (e) => {
    paper.focus(); document.execCommand('formatBlock', false, '<' + e.target.value + '>'); scheduleSave();
  };
  function syncToolbar() {
    if (!paper.contains(document.getSelection().anchorNode)) return;
    ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].forEach((c) => {
      const b = $(`#etoolbar [data-cmd="${c}"]`); try { b.classList.toggle('on', document.queryCommandState(c)); } catch (e) {}
    });
    let v = ''; try { v = (document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch (e) {}
    $('#blockFmt').value = ['h1', 'h2', 'h3', 'blockquote'].includes(v) ? v : 'p';
    // focus mode current paragraph
    if (document.body.classList.contains('focus')) {
      let n = document.getSelection().anchorNode;
      while (n && n.parentNode !== paper) n = n.parentNode;
      $$('.cur', paper).forEach((x) => x.classList.remove('cur'));
      if (n && n.nodeType === 1) n.classList.add('cur');
    }
  }
  document.addEventListener('selectionchange', syncToolbar);

  // placeholders: click selects whole "[ ... ]" chip
  paper.addEventListener('click', (e) => {
    const ph = e.target.closest('.ph');
    if (ph) { const r = document.createRange(); r.selectNodeContents(ph); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  });
  // typing over a selected placeholder removes the chip styling
  paper.addEventListener('beforeinput', () => {
    const n = getSelection().anchorNode; const ph = n && (n.nodeType === 1 ? n : n.parentNode).closest && (n.nodeType === 1 ? n : n.parentNode).closest('.ph');
    if (ph && getSelection().toString() === ph.textContent) {
      const t = document.createTextNode(''); ph.replaceWith(t);
      const r = document.createRange(); r.setStart(t, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r);
    }
  });

  // clean paste
  paper.addEventListener('paste', (e) => {
    const cd = e.clipboardData; if (!cd) return;
    e.preventDefault();
    const html = cd.getData('text/html');
    const clean = html ? sanitize(html) : textToHtml(cd.getData('text/plain'));
    document.execCommand('insertHTML', false, clean);
    stats(); scheduleSave();
  });

  // keyboard shortcuts
  paper.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); toast('Saved in this browser. Use Download to keep a copy.'); }
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand(e.shiftKey ? 'outdent' : 'insertText', false, e.shiftKey ? null : ' '); }
  });

  // ---------- style modes ----------
  function applyStyle() {
    const m = $('#styleMode').value;
    paper.classList.toggle('mla', m === 'mla'); paper.classList.toggle('apa', m === 'apa');
  }
  $('#styleMode').onchange = () => { applyStyle(); scheduleSave(); };

  $('#focusBtn').onclick = () => {
    const on = document.body.classList.toggle('focus');
    paper.classList.toggle('focus-dim', on);
    $('#focusBtn').classList.toggle('on', on);
    if (!on) $$('.cur', paper).forEach((x) => x.classList.remove('cur'));
    toast(on ? 'Focus mode on. Click Focus again to exit.' : 'Focus mode off');
  };

  // ---------- heading info ----------
  const head = store.get('heading', {});
  const mlaDate = (d = new Date()) => `${d.getDate()} ${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
  ['hName', 'hTeacher', 'hClass'].forEach((id) => { $('#' + id).value = head[id] || ''; $('#' + id).oninput = () => { head[id] = $('#' + id).value; store.set('heading', head); }; });
  $('#hDate').value = mlaDate();
  $('#insertHeading').onclick = () => {
    const v = (id, ph) => $(id).value.trim() ? esc($(id).value.trim()) : `<span class="ph">[${ph}]</span>`;
    const mode = $('#styleMode').value;
    let block;
    if (mode === 'apa') {
      block = `<div class="heading-block" style="text-align:center"><p><br></p><p><b><span class="ph">[Title of Paper]</span></b></p><p><br></p><p>${v('#hName', 'Your Name')}</p><p>${v('#hClass', 'Class')}</p><p>${v('#hTeacher', 'Teacher')}</p><p>${v('#hDate', 'Date')}</p><p><br></p></div>`;
    } else {
      block = `<div class="heading-block"><p>${v('#hName', 'Your Name')}</p><p>${v('#hTeacher', 'Teacher')}</p><p>${v('#hClass', 'Class')}</p><p>${v('#hDate', 'Date')}</p></div>`;
    }
    paper.insertAdjacentHTML('afterbegin', block);
    if (mode === 'normal') toast('Tip: switch to MLA or APA (top right) for school formatting');
    stats(); scheduleSave();
  };

  // ---------- templates ----------
  const P = (s) => `<span class="ph">[${s}]</span>`;
  const para = (...s) => `<p>${s.join(' ')}</p>`;
  const TEMPLATES = [
    { name: 'Blank', html: '<h1>' + P('Title') + '</h1><p><br></p>' },
    { name: '5-paragraph essay', html:
      `<h1>${P('Title')}</h1>
      <h2>Introduction</h2>${para(P('Hook: a question, fact, or quote that grabs attention.'), P('Background: 1–2 sentences of context.'), P('Thesis: your main claim + your 3 reasons.'))}
      <h2>Body 1</h2>${para(P('Topic sentence for reason #1.'), P('Evidence: quote, fact, or example.'), P('Explain how the evidence proves your point.'), P('Transition to next paragraph.'))}
      <h2>Body 2</h2>${para(P('Topic sentence for reason #2.'), P('Evidence.'), P('Explanation.'), P('Transition.'))}
      <h2>Body 3</h2>${para(P('Topic sentence for reason #3.'), P('Evidence.'), P('Explanation.'), P('Transition.'))}
      <h2>Conclusion</h2>${para(P('Restate your thesis in new words.'), P('Sum up your 3 reasons.'), P('Final thought: why it matters / call to action.'))}` },
    { name: 'Argumentative', html:
      `<h1>${P('Title')}</h1>
      ${para(P('Hook.'), P('Introduce the issue and why people disagree.'), P('Thesis: your position, stated clearly.'))}
      <h2>Reason 1</h2>${para(P('Claim.'), P('Evidence + source.'), P('Why this supports your side.'))}
      <h2>Reason 2</h2>${para(P('Claim.'), P('Evidence + source.'), P('Why this supports your side.'))}
      <h2>Counterargument</h2>${para(P('"Some people argue that…" (state the other side fairly).'), P('Rebuttal: why your side is still stronger.'))}
      <h2>Conclusion</h2>${para(P('Restate your position.'), P('What should happen next?'))}` },
    { name: 'Compare & contrast', html:
      `<h1>${P('A vs. B')}</h1>
      ${para(P('Introduce both subjects.'), P('Thesis: the most important similarity/difference.'))}
      <h2>Similarities</h2>${para(P('Point 1: how A and B are alike + examples.'), P('Point 2.'))}
      <h2>Differences</h2>${para(P('Point 1: how A is different from B + examples.'), P('Point 2.'))}
      <h2>Conclusion</h2>${para(P('What comparing them teaches us.'))}` },
    { name: 'Narrative / personal', html:
      `<h1>${P('Title')}</h1>
      ${para(P('Open in the middle of the action or with a strong detail.'))}
      ${para(P('Set the scene: where, when, who.'))}
      ${para(P('Rising action: what happened, step by step. Use senses: sight, sound, smell.'))}
      ${para(P('Climax: the most important moment.'))}
      ${para(P('Reflection: what you learned or how you changed.'))}` },
    { name: 'Book report', html:
      `<h1>${P('Book Title')} by ${P('Author')}</h1>
      <h2>Summary</h2>${para(P('Main characters, setting, and what happens (no spoilers past the middle if asked).'))}
      <h2>Themes</h2>${para(P('A big idea in the book + an example scene.'))}
      <h2>Favorite part</h2>${para(P('A moment you liked and why.'))}
      <h2>Recommendation</h2>${para(P('Who should read it? Rating out of 5?'))}` },
    { name: 'Lab report', html:
      `<h1>${P('Lab Title')}</h1>
      <h2>Question / Purpose</h2>${para(P('What are you trying to find out?'))}
      <h2>Hypothesis</h2>${para(P('If …, then …, because …'))}
      <h2>Materials</h2><ul><li>${P('Item')}</li><li>${P('Item')}</li></ul>
      <h2>Procedure</h2><ol><li>${P('Step')}</li><li>${P('Step')}</li><li>${P('Step')}</li></ol>
      <h2>Data / Results</h2>${para(P('What you measured. Describe any patterns.'))}
      <h2>Conclusion</h2>${para(P('Was your hypothesis supported? Sources of error? What would you change?'))}` },
    { name: 'Research paper', html:
      `<h1>${P('Title')}</h1>
      <h2>Introduction</h2>${para(P('Topic background.'), P('Research question / thesis.'))}
      <h2>${P('Section 1 heading')}</h2>${para(P('Point + evidence (Author page#).'))}
      <h2>${P('Section 2 heading')}</h2>${para(P('Point + evidence (Author page#).'))}
      <h2>${P('Section 3 heading')}</h2>${para(P('Point + evidence (Author page#).'))}
      <h2>Conclusion</h2>${para(P('Answer your research question.'))}
      <h2>Works Cited</h2>${para(P('Last, First. "Title of Article." Website or Journal, Date, URL.'))}${para(P('Last, First. Book Title. Publisher, Year.'))}` },
    { name: 'Letter / email', html:
      `<p>Dear ${P('Name')},</p>${para(P('Why you\'re writing.'))}${para(P('Details.'))}${para(P('What you\'d like to happen next.'))}<p>Sincerely,</p><p>${P('Your name')}</p>` }
  ];
  function renderTpls() {
    const box = $('#essayTpls'); box.innerHTML = '';
    TEMPLATES.forEach((t) => {
      const b = document.createElement('button'); b.className = 'btn sm block'; b.style.textAlign = 'left';
      b.textContent = t.name;
      b.onclick = async () => {
        const clean = t.html.replace(/\n\s*/g, '');
        const empty = !paper.innerText.trim();
        if (empty) { paper.innerHTML = clean; }
        else {
          const ok = await modal('Use template', '<p>Start a <b>new essay</b> with this template? Your current essay stays saved.</p>', { ok: 'New essay' });
          if (!ok) return;
          saveNow(); newDoc(clean);
        }
        stats(); saveNow();
        const first = $('.ph', paper); if (first) first.click();
        toast('Click any highlighted [box] to replace it with your writing');
      };
      box.appendChild(b);
    });
  }

  // ---------- tips ----------
  const TIPS = [
    'Your thesis = your claim + your reasons. One sentence.',
    'Every body paragraph: point, evidence, explanation.',
    'Use transitions: "Furthermore", "However", "As a result", "In contrast".',
    'Read your essay out loud. You\'ll catch mistakes your eyes miss.',
    'Don\'t start the conclusion with "In conclusion". Restate the thesis in new words instead.',
    'Quote less, explain more. Teachers grade your thinking.',
    'Cite as you write. It\'s way harder to find sources later.',
    'Cut "very", "really", "a lot". Use one stronger word.',
    'Stuck? Write the body first, then the intro.',
    'MLA in-text citation: (Author page#), e.g. (Smith 42).',
    'APA in-text citation: (Author, Year), e.g. (Smith, 2021).'
  ];
  function renderTips() {
    const t = TIPS.slice().sort(() => Math.random() - .5).slice(0, 3);
    $('#tips').innerHTML = t.map((x) => `<p>${esc(x)}</p>`).join('');
  }

  // ---------- exports ----------
  const fname = () => safeName(curDoc() ? curDoc().title : 'essay', 'essay');
  function exportCSS(m) {
    if (m === 'mla' || m === 'apa') return `body{font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:2}p{margin:0;text-indent:.5in}.heading-block p,h1{text-indent:0}h1{font-size:12pt;text-align:center;font-weight:${m === 'apa' ? 'bold' : 'normal'};margin:0}h2,h3{font-size:12pt;margin:0}`;
    return `body{font-family:Georgia,'Times New Roman',serif;font-size:12pt;line-height:1.6}h1{text-align:center}`;
  }
  function cleanForExport() {
    const tmp = document.createElement('div'); tmp.innerHTML = paper.innerHTML;
    $$('.ph', tmp).forEach((s) => s.replaceWith(...s.childNodes));
    $$('.cur', tmp).forEach((s) => s.classList.remove('cur'));
    return tmp.innerHTML;
  }
  function wordDoc() {
    const m = $('#styleMode').value;
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(fname())}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>@page{size:8.5in 11in;margin:1in}${exportCSS(m)}</style></head><body>${cleanForExport()}</body></html>`;
  }
  $('#dlDoc').onclick = () => { saveNow(); download(fname() + '.doc', '﻿' + wordDoc(), 'application/msword'); toast('Opens in Word, Google Docs, and Pages'); };
  $('#dlHtml').onclick = () => { saveNow(); download(fname() + '.html', `<!doctype html><html><head><meta charset="utf-8"><title>${esc(fname())}</title><style>body{max-width:700px;margin:40px auto;padding:0 16px}${exportCSS($('#styleMode').value)}</style></head><body>${cleanForExport()}</body></html>`, 'text/html'); };
  $('#dlTxt').onclick = () => { saveNow(); download(fname() + '.txt', paper.innerText, 'text/plain'); };
  $('#dlPdf').onclick = () => {
    saveNow();
    toast('In the print window, choose "Save as PDF"', 3500);
    setTimeout(() => window.print(), 300);
  };

  // ---------- save / open / import ----------
  function docData(d = curDoc()) {
    return { app: 'free-studio', kind: 'essay', version: 1, title: d.title, html: d.html, style: d.style, goal: d.goal, updated: d.updated };
  }
  function importDoc(data) {
    if (!data || typeof data.html !== 'string') { toast('That essay file looks broken.'); return; }
    saveNow();
    newDoc(sanitize(data.html), { style: data.style || 'normal', goal: data.goal || '' });
    toast('Essay opened');
  }
  async function importFile(f) {
    if (!f) return;
    const name = f.name.toLowerCase();
    try {
      if (name.endsWith('.fsdoc') || name.endsWith('.freestudio') || name.endsWith('.json')) return window.FS.openAnyFile(f);
      if (name.endsWith('.docx')) {
        toast('Reading Word file…');
        await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js');
        const res = await window.mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() });
        saveNow(); newDoc(sanitize(res.value)); toast('Word file imported'); return;
      }
      if (name.endsWith('.doc')) {
        const txt = await f.text();
        if (/<html/i.test(txt)) { saveNow(); newDoc(sanitize(txt.replace(/^[\s\S]*<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, ''))); toast('Imported'); return; }
        toast('Old .doc files can\'t be read. Save it as .docx first.'); return;
      }
      if (name.endsWith('.html') || name.endsWith('.htm')) {
        const txt = await f.text();
        const body = (txt.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, txt])[1];
        saveNow(); newDoc(sanitize(body)); toast('Imported'); return;
      }
      if (name.endsWith('.md')) {
        const txt = await f.text();
        const html = txt.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((b) => {
          const m = b.match(/^(#{1,3})\s+(.*)/); if (m) return `<h${m[1].length}>${esc(m[2])}</h${m[1].length}>`;
          return `<p>${esc(b).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\n/g, '<br>')}</p>`;
        }).join('');
        saveNow(); newDoc(sanitize(html)); toast('Imported'); return;
      }
      saveNow(); newDoc(textToHtml(await f.text())); toast('Imported');
    } catch (e) {
      toast(name.endsWith('.docx') ? 'Couldn\'t read that Word file (need internet the first time).' : 'Couldn\'t read that file.');
    }
  }

  // ---------- send to yourself ----------
  async function sendDialog() {
    saveNow();
    const d = curDoc();
    const ok = await modal('Send / share this essay',
      `<div class="col-btns">
        <button class="btn sm block" data-s="email">Email it to myself</button>
        <button class="btn sm block" data-s="share">Share (phone: Messages, Drive, AirDrop)</button>
        <button class="btn sm block" data-s="link">Copy a link that contains this essay</button>
        <button class="btn sm block" data-s="file">Download editable copy (.fsdoc)</button>
      </div>
      <p class="hint">Nothing is uploaded to us. Email/share use your own apps; the link holds the essay inside it.</p>`,
      { ok: 'Close', cancel: null, onOpen: (box) => {
        $$('[data-s]', box).forEach((b) => (b.onclick = () => { $('#modalOk').click(); setTimeout(() => doSend(b.dataset.s, d), 50); }));
      } });
    void ok;
  }
  async function doSend(kind, d) {
    if (kind === 'email') {
      const body = paper.innerText;
      const MAX = 1800;
      if (body.length > MAX) {
        download(fname() + '.doc', '﻿' + wordDoc(), 'application/msword');
        location.href = `mailto:?subject=${encodeURIComponent(d.title)}&body=${encodeURIComponent('(Essay attached: drag in the .doc file that just downloaded.)')}`;
        modal('Long essay', '<p>Your essay is too long to paste into an email link, so a <b>.doc</b> file was downloaded. Attach it to the email that opened.</p>', { cancel: null });
      } else {
        location.href = `mailto:?subject=${encodeURIComponent(d.title)}&body=${encodeURIComponent(body)}`;
      }
    }
    if (kind === 'share') {
      const file = new File(['﻿' + wordDoc()], fname() + '.doc', { type: 'application/msword' });
      if (await shareFile(file, d.title)) return;
      try { if (navigator.share) { await navigator.share({ title: d.title, text: paper.innerText }); return; } }
      catch (e) { if (e.name === 'AbortError') return; }
      download(file.name, file);
      toast('Sharing not supported here, so downloaded a copy instead');
    }
    if (kind === 'link') {
      const packed = await packText(JSON.stringify({ t: d.title, h: cleanForExport(), s: d.style }));
      const url = location.origin + location.pathname + '#doc=' + packed;
      if (url.length > 60000) toast('Essay is very long. The link may not work in every app. Try .fsdoc instead.', 4000);
      if (await copy(url)) toast('Link copied! Paste it in a note, DM or email to yourself.', 3500);
      else modal('Copy this link', `<textarea style="width:100%;height:120px">${esc(url)}</textarea>`, { cancel: null });
    }
    if (kind === 'file') {
      download(fname() + '.fsdoc', JSON.stringify(docData(d)), 'application/json');
      toast('Saved. Open it with Open file to keep editing on any device.');
    }
  }

  // shared link → import
  async function checkHash() {
    const h = location.hash;
    if (!h.startsWith('#doc=')) return false;
    window.FS.show('essay');
    try {
      const data = JSON.parse(await unpackText(h.slice(5)));
      const ok = await modal('Open shared essay?', `<p>Someone shared <b>${esc(data.t || 'an essay')}</b> with you. Add it to your essays?</p>`, { ok: 'Open it' });
      if (ok) { saveNow(); newDoc(sanitize(data.h || ''), { style: data.s || 'normal' }); }
    } catch (e) { toast('That shared link is broken or incomplete.'); }
    history.replaceState(null, '', location.pathname + '#essay');
    return true;
  }
  window.addEventListener('hashchange', checkHash);

  // extra buttons
  const dl = $('.col-btns');
  const more = document.createElement('div'); more.className = 'col-btns'; more.style.marginTop = '6px';
  more.innerHTML = `<button id="eSend" class="btn sm block primary">Send to myself / share</button>
    <button id="eSave" class="btn sm block">Save editable copy (.fsdoc)</button>
    <button id="eImport" class="btn sm block">Import a file</button>`;
  dl.after(more);
  $('#eSend').onclick = sendDialog;
  $('#eSave').onclick = () => { saveNow(); doSend('file', curDoc()); };
  $('#eImport').onclick = async () => importFile(await pickFile('.docx,.doc,.txt,.md,.html,.htm,.fsdoc,.freestudio,.json,text/plain'));

  // drag & drop files onto the paper
  const pw = $('.paper-scroll');
  pw.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  pw.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) { e.preventDefault(); importFile(f); } });

  // ---------- backup hook ----------
  window.FS.registerBackup('essays', {
    export: async () => { saveNow(); return docs.map((d) => docData(d)).map((x, i) => ({ ...x, id: docs[i].id })); },
    import: async (arr) => {
      if (!Array.isArray(arr)) return;
      saveNow();
      let added = 0;
      arr.forEach((x) => {
        if (!x || typeof x.html !== 'string') return;
        const existing = x.id && docs.find((d) => d.id === x.id);
        const clean = { id: x.id || uid(), html: sanitize(x.html), style: x.style || 'normal', goal: x.goal || '', updated: x.updated || Date.now() };
        clean.title = titleOf(clean.html);
        if (existing) { if ((x.updated || 0) > existing.updated) Object.assign(existing, clean); }
        else { docs.push(clean); added++; }
      });
      docs.sort((a, b) => b.updated - a.updated);
      persist(); if (!curId && docs[0]) curId = docs[0].id; openDoc(curId);
      toast(`Essays restored (${added} new)`);
    }
  });

  // ---------- init ----------
  renderTpls(); renderTips();
  if (!docs.length) newDoc();
  else openDoc(curDoc() ? curId : docs[0].id);
  window.FS.essay = { importDoc };
  window.addEventListener('DOMContentLoaded', checkHash);
})();
