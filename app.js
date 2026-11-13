/* LuidgotDOx — shared helpers: tabs, theme, modal, toast, storage, files, sharing */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------- safe storage ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('fs:' + key); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem('fs:' + key, JSON.stringify(val)); return true; }
      catch (e) { return false; }
    },
    del(key) { try { localStorage.removeItem('fs:' + key); } catch (e) {} }
  };

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, ms = 2400) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms);
  }

  // ---------- modal (returns Promise<true|false>) ----------
  function modal(title, bodyHTML, { ok = 'OK', cancel = 'Cancel', onOpen } = {}) {
    return new Promise((resolve) => {
      const m = $('#modal');
      $('#modalTitle').textContent = title;
      $('#modalBody').innerHTML = bodyHTML;
      $('#modalOk').textContent = ok;
      $('#modalCancel').textContent = cancel;
      $('#modalCancel').hidden = cancel === null;
      m.hidden = false;
      if (onOpen) onOpen($('#modalBody'));
      const first = $('#modalBody input, #modalBody select, #modalBody textarea');
      (first || $('#modalOk')).focus();
      function done(v) {
        m.hidden = true;
        $('#modalOk').onclick = $('#modalCancel').onclick = null;
        document.removeEventListener('keydown', key);
        resolve(v);
      }
      function key(e) {
        if (e.key === 'Escape') done(false);
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); done(true); }
      }
      $('#modalOk').onclick = () => done(true);
      $('#modalCancel').onclick = () => done(false);
      document.addEventListener('keydown', key);
    });
  }

  // ---------- files ----------
  function download(name, data, type = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function pickFile(accept, multiple = false) {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept; inp.multiple = multiple;
      inp.onchange = () => resolve(multiple ? Array.from(inp.files) : inp.files[0] || null);
      inp.click();
    });
  }

  const readText = (f) => f.text();
  const readDataURL = (f) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f);
  });

  function safeName(s, fallback = 'untitled') {
    return (s || fallback).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || fallback;
  }

  // ---------- sharing ----------
  // Web Share with a file (phones, Safari, Edge). Returns true if shared.
  async function shareFile(file, title) {
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return true;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return true; // user closed the sheet
    }
    return false;
  }

  // compress text -> base64url (for share links)
  async function packText(str) {
    const bytes = new TextEncoder().encode(str);
    let out = bytes, tag = 'r';
    if (window.CompressionStream) {
      const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      out = new Uint8Array(await new Response(cs).arrayBuffer());
      tag = 'z';
    }
    let bin = '';
    for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
    return tag + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function unpackText(s) {
    const tag = s[0];
    const b64 = s.slice(1).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (tag === 'z') {
      const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new TextDecoder().decode(await new Response(ds).arrayBuffer());
    }
    return new TextDecoder().decode(bytes);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove(); return ok;
    }
  }

  // ---------- lazy script loader (for .docx import) ----------
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('load failed')); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }

  // ---------- views ----------
  const views = ['home', 'art', 'essay'];
  const listeners = {};
  function show(view) {
    if (!views.includes(view)) view = 'home';
    views.forEach((v) => ($('#view-' + v).hidden = v !== view));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    store.set('view', view);
    if (location.hash.slice(1) !== view && !location.hash.startsWith('#doc=')) history.replaceState(null, '', '#' + view);
    (listeners[view] || []).forEach((fn) => fn());
  }
  function onShow(view, fn) { (listeners[view] = listeners[view] || []).push(fn); }

  $$('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));
  $$('[data-go]').forEach((c) => c.addEventListener('click', () => show(c.dataset.go)));

  // ---------- theme ----------
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }
  applyTheme(store.get('theme', null));
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next); store.set('theme', next);
  });

  // ---------- full backup (both tools) ----------
  const backupParts = {}; // name -> { export(): obj, import(obj): Promise }
  function registerBackup(name, part) { backupParts[name] = part; }

  async function exportAll() {
    const data = { app: 'free-studio', kind: 'backup', version: 1, savedAt: new Date().toISOString() };
    for (const [k, p] of Object.entries(backupParts)) data[k] = await p.export();
    const d = new Date().toISOString().slice(0, 10);
    download(`luidgotdox-backup-${d}.freestudio`, JSON.stringify(data), 'application/json');
    toast('Backup downloaded. Keep it somewhere safe (Drive, email, USB).');
  }
  async function importAll(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { toast('That file isn\'t a LuidgotDOx backup.'); return; }
    if (!data || data.app !== 'free-studio') { toast('That file isn\'t a LuidgotDOx backup.'); return; }
    for (const [k, p] of Object.entries(backupParts)) if (data[k]) await p.import(data[k]);
    toast('Backup restored ✔');
  }

  // add backup buttons to the top bar
  const bk = document.createElement('div');
  bk.className = 'row';
  bk.innerHTML = '<button class="btn sm" id="backupBtn" title="Download everything (essays + art) as one file">💾 Backup all</button>' +
    '<button class="btn sm" id="restoreBtn" title="Open a backup or any saved LuidgotDOx file">📂 Open file</button>';
  $('.topbar').insertBefore(bk, $('#themeBtn'));
  $('#backupBtn').addEventListener('click', exportAll);
  $('#restoreBtn').addEventListener('click', async () => {
    const f = await pickFile('.freestudio,.fsdoc,.fsart,.json,application/json');
    if (f) openAnyFile(f);
  });

  // route any dropped/opened LuidgotDOx file to the right tool
  async function openAnyFile(f) {
    let data;
    try { data = JSON.parse(await f.text()); } catch (e) { toast('Can\'t read that file.'); return; }
    if (!data || data.app !== 'free-studio') { toast('That isn\'t a LuidgotDOx file.'); return; }
    if (data.kind === 'backup') return importAll(f);
    if (data.kind === 'essay' && window.FS.essay) { show('essay'); return window.FS.essay.importDoc(data); }
    if (data.kind === 'art' && window.FS.art) { show('art'); return window.FS.art.loadProject(data); }
    toast('Unknown LuidgotDOx file.');
  }

  window.FS = {
    $, $$, store, toast, modal, download, pickFile, readText, readDataURL, safeName,
    shareFile, packText, unpackText, copy, loadScript, show, onShow, registerBackup, openAnyFile
  };

  // start on saved view after other scripts register
  window.addEventListener('DOMContentLoaded', () => {
    const h = location.hash.slice(1);
    if (h.startsWith('doc=')) return; // essay.js handles shared links
    show(views.includes(h) ? h : store.get('view', 'home'));
  });
})();
