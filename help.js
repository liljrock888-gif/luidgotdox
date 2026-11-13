/* LuidgotDOx: AI help chat. Free on purpose, no API key:
   1) the browser's built-in AI if the visitor has it (Chrome desktop, runs on their device),
   2) otherwise the free Pollinations AI service (questions are sent there; the panel tells people not to type personal info),
   3) otherwise (offline / service busy) the built-in guide below. */
(function () {
  'use strict';
  const { $ } = window.FS;

  const KB = [
    { k: 'save saved autosave lose lost keep where stored storage browser', a: 'Your work saves automatically in this browser as you go.\n\nTo keep it safe or move it to another device:\n- Essays: "Save editable copy (.fsdoc)" on the right side of the Essay Writer\n- Art: "Save" in the art toolbar (keeps all your layers)\n- Everything at once: "Backup all" in the top bar\n\nClearing your browser data deletes the autosave, so download a copy of anything important.' },
    { k: 'send email myself share phone link airdrop text message drive', a: 'Essay Writer, right panel, "Send to myself / share":\n- Email it to myself: opens your email app with the essay inside\n- Share: on phones, opens the share menu (Messages, Drive, AirDrop...)\n- Copy a link: the link has the whole essay inside it. Open it on any device to get the essay back.\n\nFor art, use "Share" in the art toolbar, or "Export PNG".' },
    { k: 'import open upload word docx doc file txt google docs', a: 'Click "Import a file" in the Essay Writer (right panel), or drag a file onto the page.\n\nWorks with Word (.docx), .txt, .html, .md and saved LuidgotDOx files.\n\nFrom Google Docs: File > Download > Microsoft Word (.docx), then import that file.' },
    { k: 'download export word pdf print doc docx turn in submit teacher', a: 'Essay Writer, right panel, under Download:\n- Word (.doc): opens in Word, Google Docs and Pages\n- PDF / Print: choose "Save as PDF" in the print window\n- Plain text and web page options too\n\nFor art: "Export PNG" in the art toolbar.' },
    { k: 'mla apa format heading citation works cited double spaced times new roman', a: 'Pick "MLA" or "APA" in the dropdown at the right end of the essay toolbar. You get Times New Roman 12pt, double spacing and indented paragraphs.\n\nThen fill in your name, teacher, class and date on the right and click "Insert heading block".\n\nIn-text citations:\n- MLA: (Smith 42)\n- APA: (Smith, 2021)\n\nThe "Research paper" template already has a Works Cited section.' },
    { k: 'template essay five 5 paragraph argumentative compare narrative lab book report research', a: 'Essay templates are in the right panel of the Essay Writer. Each one gives you a full outline with highlighted [boxes]. Click a box and type to replace it.\n\nThere are templates for 5-paragraph, argumentative, compare & contrast, narrative, book report, lab report, research paper and letter.' },
    { k: 'thesis intro introduction hook start begin stuck', a: 'A strong intro has three parts:\n1. Hook: a surprising fact, question or short quote\n2. Background: 1 to 2 sentences of context\n3. Thesis: your claim plus your reasons, in one sentence\n\nThesis formula: "[Topic] is/should [claim] because [reason 1], [reason 2], and [reason 3]."\n\nStuck? Write your body paragraphs first, then come back to the intro.' },
    { k: 'conclusion end ending finish', a: 'Conclusion recipe:\n1. Restate your thesis in new words. Don\'t copy it.\n2. Quickly sum up your main points\n3. End with why it matters, a prediction, or a call to action\n\nAvoid starting with "In conclusion" and avoid adding brand-new evidence.' },
    { k: 'paragraph body evidence explain transition quote', a: 'Every body paragraph:\n1. Topic sentence: the point of this paragraph\n2. Evidence: a quote, fact or example\n3. Explanation: how the evidence proves your point. This is the most important part.\n4. Transition into the next paragraph\n\nTransitions: Furthermore, However, In contrast, As a result, For example.' },
    { k: 'word count goal words long length', a: 'The word count is in the bar at the bottom of the essay. Type a number in "Goal" to get a progress bar toward your target.' },
    { k: 'focus distraction mode', a: 'Click "Focus" in the essay toolbar to hide the side panels and fade everything except the paragraph you\'re on. Click it again to exit.' },
    { k: 'brush draw pen eraser size opacity color tool', a: 'Pick a tool on the left of the Art Studio: Brush, Eraser, Line, Rectangle, Circle, Fill, Text, Eyedropper.\n\nSize and Opacity sliders are under the colors. Shortcuts: B brush, E eraser, [ and ] change size.' },
    { k: 'layer layers hide move order', a: 'Layers are on the left of the Art Studio.\n- Click a layer to draw on it\n- "+ Layer" adds one above\n- Hide / Show, Up / Down on each row\n- Double-click a layer to rename it\n\nTip: keep your background, drawing and text on separate layers so you can change one without messing up the others.' },
    { k: 'undo redo mistake oops back', a: 'Undo: Ctrl+Z (Cmd+Z on Mac) or the Undo button.\nRedo: Ctrl+Y or Ctrl+Shift+Z.\n\nUndo works in both the art studio and the essay writer.' },
    { k: 'generator generate palette colors pattern gradient random art idea prompt', a: 'Art Studio, right panel, "Generators":\n- Palette: makes 5 matching colors. Click one to use it.\n- Gradient background: fills the selected layer\n- Pattern: dots, stripes, waves, confetti and more\n- Random art: bubbles, galaxy, pixel creature and more\n- Art prompt: gives you something to draw\n\nGenerators draw on the selected layer, and Undo works on them.' },
    { k: 'roblox shirt clothing template', a: 'Art Studio > Templates > "Roblox classic shirt" (585×559).\n\nThe outlined boxes show where the front, back, sleeves and so on go. The outlines don\'t export. Paint inside them, then "Export PNG" and upload the PNG on Roblox (Create > Avatar Items > Classic Shirts).' },
    { k: 'thumbnail youtube poster pfp profile wallpaper meme banner pixel emote sticker', a: 'Art Studio > Templates has ready-made sizes: YouTube thumbnail, poster, profile picture, Instagram post, phone and desktop wallpaper, meme, Discord/Twitch banner, pixel art and emote.\n\nFor a meme: pick Meme, click "Image" to add your picture, then edit the text layer.' },
    { k: 'image picture photo add insert paste', a: 'Click "Image" in the art toolbar, drag a picture onto the canvas, or paste one with Ctrl+V. It goes on its own new layer.' },
    { k: 'text words write caption font outline', a: 'Pick the Text tool, then click where you want the text. It\'s centered on your click. Choose the font and outline on the left before clicking.' },
    { k: 'fill bucket paint area', a: 'The Fill tool fills an area of matching color (it looks at all visible layers) and paints onto the selected layer.' },
    { k: 'png export save picture download image art', a: '"Export PNG" (the dark button in the art toolbar) downloads your picture. Hidden layers are left out. To keep editing later, use "Save" instead. That keeps your layers.' },
    { k: 'dark light mode theme', a: 'Use the Dark / Light button in the top right corner.' },
    { k: 'free cost money pay price account login sign', a: 'LuidgotDOx is completely free. No account, no ads, and your work stays on your device. It was made by Timid Studios.' },
    { k: 'who made timid studios creator', a: 'LuidgotDOx was made by Timid Studios. You can find their other projects from the link at the bottom of the home page.' },
    { k: 'phone mobile ipad tablet', a: 'It works on phones and tablets too. On a phone, the canvas or the page is on top and the tools are below. Scroll down for them.' },
    { k: 'write my essay for me do my homework', a: 'I can\'t write your essay for you, but I can help you write it fast:\n1. Pick a template in the Essay Writer\n2. Tell me your topic and I\'ll help you shape a thesis\n3. Fill the highlighted boxes one at a time\n\nAsk me about intros, thesis statements, body paragraphs or conclusions.' }
  ];
  const STOP = new Set('a an the i my me to do how can is it in on of for and or you what where why with this that does get make use your'.split(' '));
  const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));

  function answerLocal(q) {
    const qw = words(q);
    let best = null, bestScore = 0;
    for (const item of KB) {
      const keys = item.k.split(' ');
      let s = 0;
      for (const w of qw) for (const k of keys) {
        if (w === k) s += 2;
        else if (w.length > 3 && (k.startsWith(w) || w.startsWith(k))) s += 1;
      }
      if (s > bestScore) { bestScore = s; best = item; }
    }
    if (best && bestScore >= 2) return best.a;
    if (/^(hi|hey|hello|yo|sup)\b/i.test(q.trim())) return 'Hey! Ask me how to do anything on LuidgotDOx: saving, sending an essay to yourself, MLA format, layers, Roblox shirts, and more.';
    return 'I\'m not sure about that one. Try asking about:\n- saving or sending your work\n- importing a Word file\n- MLA / APA format\n- writing a thesis, intro or conclusion\n- layers, generators or templates in the Art Studio';
  }

  // ---------- browser built-in AI (only if already on the device; never triggers a big download) ----------
  let aiSession = null, aiChecked = false, aiOK = false;
  const SYSTEM = `You are the friendly help assistant inside LuidgotDOx, a free website by Timid Studios with two tools:
1) Art Studio: brush, eraser, line, rectangle, circle, fill, text, eyedropper; layers (hide/show, up/down, rename by double-click); undo; generators (palette, gradient background, patterns, random art, art prompt); templates (YouTube thumbnail, poster, profile picture, Instagram post, phone/desktop wallpaper, meme, Roblox classic shirt 585x559, Discord/Twitch banner, pixel art, emote); Image button to import pictures; Save (.fsart keeps layers), Share, Export PNG.
2) Essay Writer: toolbar formatting, MLA/APA mode, heading block, 9 essay templates with highlighted [boxes], word goal, Focus mode; Download as Word/PDF/text/html; Send to myself (email, share, link that contains the essay); Save editable copy (.fsdoc); Import a file (.docx, .txt, .html, .md).
Top bar: Backup all, Open file, Dark/Light. Everything is free, no account, and work is saved in the browser.
Keep answers short and simple (a few sentences or a short list). Students use this site: coach them on writing (thesis, structure, feedback, brainstorming) but do not write whole essays for them to turn in.`;

  async function aiAvailable() {
    if (aiChecked) return aiOK;
    aiChecked = true;
    try {
      if (typeof LanguageModel !== 'undefined' && LanguageModel.availability) {
        aiOK = (await LanguageModel.availability()) === 'available';
      }
    } catch (e) { aiOK = false; }
    return aiOK;
  }
  async function answerAI(q, onChunk) {
    if (!aiSession) aiSession = await LanguageModel.create({ initialPrompts: [{ role: 'system', content: SYSTEM }] });
    let out = '';
    const stream = aiSession.promptStreaming(q);
    for await (const chunk of stream) {
      // some versions stream deltas, older ones stream the full text so far
      out = chunk.startsWith(out) ? chunk : out + chunk;
      onChunk(out);
    }
    return out;
  }

  // ---------- free online AI (Pollinations: no key, no account, CORS-enabled) ----------
  const CLOUD = 'https://text.pollinations.ai/openai';
  const history = [];   // recent turns so follow-up questions make sense
  const tidy = (s) => String(s || '')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')      // markdown bold
    .replace(/^#{1,6}\s*/gm, '').replace(/^\s*[*-]\s+/gm, '- ')      // headings, bullets
    .replace(/`([^`]+)`/g, '$1').trim();
  async function answerCloud(q, onWait) {
    const body = JSON.stringify({
      model: 'openai', referrer: 'luidgotdox',
      messages: [{ role: 'system', content: SYSTEM }, ...history.slice(-8), { role: 'user', content: q }]
    });
    // the free tier sometimes refuses a request that comes right after another one: wait and retry
    for (let attempt = 0; attempt < 4; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      try {
        const res = await fetch(CLOUD, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body });
        if (res.status === 402 || res.status === 429 || res.status >= 500) {
          const ra = parseFloat(res.headers.get('Retry-After'));
          const wait = Math.min(15000, (ra > 0 ? ra * 1000 : 0) || [4000, 6000, 8000, 8000][attempt]);   // ~15s covers the free tier's cooldown
          if (onWait) onWait(attempt);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) throw new Error('http ' + res.status);
        const data = await res.json();
        const text = tidy(data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
        if (!text) throw new Error('empty');
        return text;
      } finally { clearTimeout(timer); }
    }
    throw new Error('busy');
  }
  async function typeOut(m, text) {
    m.classList.remove('typing');
    const step = Math.max(2, Math.round(text.length / 120));
    for (let i = step; i < text.length + step; i += step) {
      m.textContent = text.slice(0, i); log.scrollTop = log.scrollHeight;
      await new Promise((r) => setTimeout(r, 12));
    }
  }

  // ---------- UI ----------
  const fab = document.createElement('button');
  fab.className = 'help-fab'; fab.textContent = 'Need help?'; fab.setAttribute('aria-label', 'Open help chat');
  const panel = document.createElement('section');
  panel.className = 'help-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Help chat');
  panel.innerHTML = `<div class="help-head"><div><b>Help</b><small id="helpMode">Ask anything about LuidgotDOx</small></div><button id="helpClose">Close</button></div>
    <div class="help-log" id="helpLog" aria-live="polite"></div>
    <div class="help-chips" id="helpChips"></div>
    <form class="help-form" id="helpForm"><input id="helpIn" placeholder="Type a question…" autocomplete="off" maxlength="600"><button class="btn sm primary">Send</button></form>`;
  document.body.append(fab, panel);

  const log = $('#helpLog');
  function add(text, who) {
    const m = document.createElement('div'); m.className = 'msg ' + who; m.textContent = text;
    log.appendChild(m); log.scrollTop = log.scrollHeight; return m;
  }
  const CHIPS = ['How do I save my work?', 'Send my essay to myself', 'MLA format', 'Help with my thesis', 'Make a Roblox shirt', 'Import a Word file'];
  CHIPS.forEach((c) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = c;
    b.onclick = () => ask(c); $('#helpChips').appendChild(b);
  });

  let greeted = false;
  async function open() {
    panel.hidden = false; fab.hidden = true; $('#helpIn').focus();
    if (!greeted) {
      greeted = true;
      add('Hi! I\'m the LuidgotDOx AI helper. Ask me how to do anything here, brainstorm ideas, or get feedback on your writing.', 'bot');
      $('#helpMode').textContent = (await aiAvailable())
        ? 'AI running on your device. Free and private.'
        : 'Free AI helper. Don\'t type personal info.';
    }
  }
  function close() { panel.hidden = true; fab.hidden = false; }
  fab.onclick = open; $('#helpClose').onclick = close;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden && $('#modal').hidden) close(); });

  let busy = false;
  async function ask(q) {
    q = (q || '').trim(); if (!q || busy) return;
    busy = true; add(q, 'me'); $('#helpIn').value = '';
    const m = add('Thinking…', 'bot typing');
    let answer = '';
    // 1) AI built into the browser (Chrome desktop), private and offline
    try {
      if (await aiAvailable()) {
        await answerAI(q, (t) => { m.classList.remove('typing'); m.textContent = t; log.scrollTop = log.scrollHeight; });
        answer = m.textContent.trim();
      }
    } catch (e) { answer = ''; }
    // 2) free online AI, works everywhere incl. phones
    if (!answer && navigator.onLine !== false) {
      try {
        answer = await answerCloud(q, (n) => { m.textContent = n ? 'Still thinking… (the free AI is busy)' : 'Thinking hard…'; });
        await typeOut(m, answer);
      } catch (e) { answer = ''; }
    }
    // 3) built-in guide (offline / AI busy)
    if (!answer) {
      answer = answerLocal(q);
      if (/^I'm not sure about that one/.test(answer)) {
        answer = (navigator.onLine === false ? 'You\'re offline, so the AI can\'t answer right now.' : 'The free AI is busy right now. Try again in a minute.') +
          '\n\nI can still help with:\n- saving or sending your work\n- importing a Word file\n- MLA / APA format\n- writing a thesis, intro or conclusion\n- layers, generators or templates';
      }
      m.classList.remove('typing'); m.textContent = answer;
    }
    history.push({ role: 'user', content: q }, { role: 'assistant', content: answer.slice(0, 1500) });
    if (history.length > 16) history.splice(0, history.length - 16);
    log.scrollTop = log.scrollHeight; busy = false; $('#helpIn').focus();
  }
  $('#helpForm').addEventListener('submit', (e) => { e.preventDefault(); ask($('#helpIn').value); });

  window.FS.help = { open, ask, answerLocal };
})();
