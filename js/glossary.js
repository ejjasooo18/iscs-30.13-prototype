/* =========================================================================
   Glossary overlay — plain-language help for technology jargon.

   A separate layer on top of #device (it never edits the app's own DOM).
   While Focus mode is on, it scans the visible, non-blurred text of the
   current screen and marks technology-specific terms that older or less
   tech-savvy users may not know (2FA/OTP, MPIN, InstaPay…), with a "?"
   button that opens a simple explanation. Everyday words (fee, account
   number, Express Send…) are deliberately left out, and at most
   MAX_PER_SCREEN terms are marked per screen so the page stays calm.

   Hooks used: #device / #screen / #modal-root / #toast-root, the .focus-on
   class on #device, and the .fx-blur / inert markers Focus mode puts on
   blurred content.
   Fires: window 'overlay:glossary' { term } when a card is opened.
   ========================================================================= */
(() => {
  const MAX_PER_SCREEN = 2;

  /* Priority order: when a screen has more terms than MAX_PER_SCREEN, the
     earlier entries win. One entry can match several spellings. */
  const GLOSSARY = [
    { id: 'otp', match: /Two-Factor Authentication(?: \(2FA\))?|\b2FA\b|One-Time PIN(?: \(OTP\))?|\bOTP\b/,
      term: 'Two-Factor Authentication (2FA) and One-Time PIN (OTP)',
      simple: 'An extra safety check using a code sent to your phone',
      explain: 'Before money leaves your account, we send a 6-digit code (the OTP) to your phone by text message. Type it in to prove it is really you. The code works only once and expires after 5 minutes. Never give this code to anyone, not even someone who says they work for the app.' },
    { id: 'mpin', match: /\bMPIN\b/, term: 'MPIN',
      simple: 'Your secret 4-digit app PIN',
      explain: 'Like an ATM PIN, but for opening this app. Keep it to yourself.' },
    { id: 'instapay', match: /InstaPay/, term: 'InstaPay',
      simple: 'A way to send money to other banks right away',
      explain: 'The money usually arrives within seconds. A small fee is charged for each transfer.' },
    { id: 'ewallet', match: /e-wallets?/i, term: 'E-wallet',
      simple: 'A money app on your phone',
      explain: 'An app that holds money you can spend or send, like this one.' },
    { id: 'qr', match: /\bQR\b/, term: 'QR code',
      simple: 'A square barcode',
      explain: 'You point your phone camera at it to pay or send money without typing details.' },
    { id: 'data', match: /\b(?:mobile )?data\b/i, term: 'Mobile data',
      simple: 'Internet on your phone',
      explain: 'Lets you use the internet when you are not connected to Wi-Fi. It is measured in GB: more GB means more internet use.' },
    { id: 'sms', match: /\bSMS\b/, term: 'SMS',
      simple: 'A text message',
      explain: 'A regular text message sent to your phone.' },
    { id: 'ereceipt', match: /e-receipt/i, term: 'E-receipt',
      simple: 'A receipt sent by email',
      explain: 'A copy of your receipt sent to your email address instead of on paper.' },
  ];
  const BY_ID = Object.fromEntries(GLOSSARY.map(g => [g.id, g]));

  const device = document.getElementById('device');
  const screen = document.getElementById('screen');
  const modalRoot = document.getElementById('modal-root');
  const toastRoot = document.getElementById('toast-root');
  if (!device || !screen) return;

  const layer = document.createElement('div');
  layer.id = 'glossary-layer';
  layer.dataset.guide = 'glossary.layer';
  layer.innerHTML = '<div class="gl-marks"></div>';
  device.appendChild(layer);
  const marks = layer.firstElementChild;
  let cardEl = null;

  /* Off while a modal is open. Toasts (e.g. the OTP text message) don't turn
     it off; terms underneath a toast are simply skipped. */
  const active = () => device.classList.contains('focus-on') && !(modalRoot && modalRoot.firstElementChild);

  function textNodes() {
    const out = [];
    const walker = document.createTreeWalker(screen, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        const p = n.parentElement;
        if (!n.nodeValue.trim() || !p || p.closest('.fx-blur, [inert], [hidden], script, style')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) out.push(walker.currentNode);
    return out;
  }

  /* First occurrence of each term on the current screen, in GLOSSARY order. */
  function findTerms() {
    const nodes = textNodes();
    const found = [];
    for (const g of GLOSSARY) {
      const re = new RegExp(g.match.source, g.match.flags.replace('g', ''));
      for (const node of nodes) {
        const m = re.exec(node.nodeValue);
        if (m) { found.push({ g, node, s: m.index, e: m.index + m[0].length }); break; }
      }
    }
    return found;
  }

  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

  function draw() {
    raf = 0;
    marks.innerHTML = '';
    if (!active()) { marks.hidden = true; return; }
    marks.hidden = false;
    const d = device.getBoundingClientRect();
    const s = screen.getBoundingClientRect();
    Object.assign(marks.style, { left: `${s.left - d.left}px`, top: `${s.top - d.top}px`, width: `${s.width}px`, height: `${s.height}px` });
    const covers = toastRoot ? [...toastRoot.children].map(t => t.getBoundingClientRect()) : [];

    let shown = 0;
    for (const f of findTerms()) {
      if (shown >= MAX_PER_SCREEN) break;
      const range = document.createRange();
      range.setStart(f.node, f.s);
      range.setEnd(f.node, f.e);
      const rects = [...range.getClientRects()].filter(r => r.width && r.height
        && r.bottom > s.top && r.top < s.bottom            // scrolled into view
        && !covers.some(c => overlaps(r, c)));             // not under a toast
      if (!rects.length) continue;
      shown++;
      rects.forEach(r => {
        const m = document.createElement('span');
        m.className = 'gl-mark';
        Object.assign(m.style, { left: `${r.left - s.left - 2}px`, top: `${r.top - s.top - 1}px`, width: `${r.width + 4}px`, height: `${r.height + 2}px` });
        marks.appendChild(m);
      });
      const last = rects[rects.length - 1];
      const q = document.createElement('button');
      q.type = 'button';
      q.className = 'gl-q';
      q.textContent = '?';
      q.dataset.term = f.g.id;
      q.dataset.guide = `glossary.${f.g.id}`;
      q.setAttribute('aria-label', `What does "${f.node.nodeValue.slice(f.s, f.e)}" mean?`);
      q.style.left = `${Math.min(last.right - s.left - 4, s.width - 26)}px`;
      q.style.top = `${Math.max(last.top - s.top - 13, 0)}px`;
      marks.appendChild(q);
    }
  }

  function openCard(id) {
    const g = BY_ID[id];
    if (!g) return;
    closeCard();
    cardEl = document.createElement('div');
    cardEl.className = 'gl-backdrop';
    cardEl.dataset.guide = 'glossary.card';
    cardEl.innerHTML = `<div class="gl-card" role="dialog" aria-modal="true" aria-labelledby="gl-title">
        <p class="gl-kicker">What does this mean?</p>
        <h3 id="gl-title"></h3>
        <p class="gl-simple"><b>In simple words:</b> <span></span></p>
        <p class="gl-explain"></p>
        <button type="button" class="gl-ok" data-guide="glossary.ok">Got it</button>
      </div>`;
    cardEl.querySelector('#gl-title').textContent = g.term;
    cardEl.querySelector('.gl-simple span').textContent = g.simple;
    cardEl.querySelector('.gl-explain').textContent = g.explain;
    layer.appendChild(cardEl);
    cardEl.querySelector('.gl-ok').focus();
    window.dispatchEvent(new CustomEvent('overlay:glossary', { detail: { term: id } }));
  }
  function closeCard() {
    if (cardEl) { cardEl.remove(); cardEl = null; }
  }

  layer.addEventListener('click', e => {
    const q = e.target.closest('.gl-q');
    if (q) { e.stopPropagation(); return openCard(q.dataset.term); }
    if (e.target.closest('.gl-ok') || e.target === cardEl) { e.stopPropagation(); closeCard(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && cardEl) closeCard(); });

  /* Toasts slide in/out, so measure again once the animation has settled. */
  const scheduleSettled = () => { schedule(); setTimeout(schedule, 350); };

  screen.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('app:screen', () => { closeCard(); scheduleSettled(); });
  window.addEventListener('app:modal', schedule);
  window.addEventListener('app:focus', e => { if (!e.detail || !e.detail.on) closeCard(); schedule(); });
  new MutationObserver(schedule).observe(screen, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'inert'] });
  new MutationObserver(schedule).observe(device, { attributes: true, attributeFilter: ['class', 'data-screen'] });
  if (modalRoot) new MutationObserver(schedule).observe(modalRoot, { childList: true });
  if (toastRoot) new MutationObserver(scheduleSettled).observe(toastRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  schedule();
})();
