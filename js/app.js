/* =========================================================================
   E-wallet replica — the "target app" that the assistive overlay sits on.
   Plain JS, hash routing (#/home, #/send/form, ...). No build step.

   Overlay hooks (for Nathan & Ian) — see README.md:
     - Every important element has data-guide="..." (stable selector).
     - window events: app:screen, app:modal, app:error, app:toast, app:transaction
     - window.App: { go, screen, state, failNext, reset, device }
   ========================================================================= */
(function () {
  'use strict';

  /* ---------------- utilities ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round2 = n => Math.round(n * 100) / 100;
  const fmt = n => '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const digits = s => String(s || '').replace(/\D/g, '');
  const initials = name => name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const refNo = () => String(Math.floor(1e12 + Math.random() * 9e12));
  const fmtDate = iso => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  function normMobile(s) {
    let d = digits(s);
    if (d.startsWith('63') && d.length === 12) d = '0' + d.slice(2);
    if (d.length === 10 && d[0] === '9') d = '0' + d;
    return d;
  }
  const validMobile = d => /^09\d{9}$/.test(d);
  const fmtMobile = d => String(d || '').replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3');
  const maskName = name => name.split(' ').map(w => (w.length <= 2 ? w : w[0] + '*'.repeat(w.length - 2) + w.slice(-1))).join(' ').toUpperCase();

  function detectNetwork(mobile) {
    const p = String(mobile || '').slice(0, 4);
    for (const [net, prefixes] of Object.entries(NETWORK_PREFIXES)) if (prefixes.includes(p)) return net;
    return null;
  }
  function recipientName(mobile) {
    const c = CONTACTS.find(c => c.mobile === mobile);
    if (c) return maskName(c.name);
    const sum = digits(mobile).split('').reduce((a, b) => a + Number(b), 0);
    return maskName(RANDOM_NAMES[sum % RANDOM_NAMES.length]);
  }
  function parseAmount(v) {
    const s = String(v ?? '').replace(/[,₱\s]/g, '');
    if (!s) return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? round2(n) : NaN;
  }
  function amountError(n, { min = 1, max = 50000, fee = 0 } = {}) {
    if (Number.isNaN(n)) return 'Please enter an amount.';
    if (n < min) return `The minimum amount is ${fmt(min)}.`;
    if (n > max) return `Amount exceeds the transaction limit of ${fmt(max)}.`;
    if (n + fee > S.balance) return `Insufficient balance. Your available balance is ${fmt(S.balance)}.`;
    return null;
  }
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

  /* ---------------- state ---------------- */
  const STORE_KEY = 'ewallet-proto-state-v1';
  function freshState() {
    const day = 864e5, now = Date.now();
    return {
      loggedIn: false,
      balance: 5250.75,
      hideBalance: false,
      promoSeen: false,
      pinAttempts: 0,
      lockedUntil: 0,
      failNext: false,
      otp: null,
      draft: {},
      last: null,
      savedBillers: [{ billerId: 'meralco', account: '0123456789', accountName: 'CORAZON TIU' }],
      txns: [
        { id: 't3', kind: 'load', title: 'Buy Load: Regular ₱50', sub: '0917 123 4567 · Globe', amount: -50, date: new Date(now - day).toISOString(), ref: '7781230045512', rows: [] },
        { id: 't2', kind: 'bill', title: 'Paid Meralco', sub: 'CAN 0123456789', amount: -1845.6, date: new Date(now - 6 * day).toISOString(), ref: '4012883192004', rows: [] },
        { id: 't1', kind: 'cashin', title: 'Cash In from BPI', sub: 'Online banking', amount: 2000, date: new Date(now - 9 * day).toISOString(), ref: '9918273645001', rows: [] },
      ],
    };
  }
  function loadState() {
    try { const raw = sessionStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }
  let S = loadState() || freshState();
  if (new URLSearchParams(location.search).has('fail')) S.failNext = true;

  /* ---------------- DOM roots ---------------- */
  const device = $('#device');
  const screenEl = $('#screen');
  const navEl = $('#bottom-nav');
  const modalRoot = $('#modal-root');
  const toastRoot = $('#toast-root');

  /* ---------------- router ---------------- */
  const ROUTES = [
    ['login', screenLogin],
    ['home', screenHome, 'home'],
    ['services', screenServices],
    ['inbox', screenInbox, 'inbox'],
    ['transactions', screenTransactions, 'transactions'],
    ['profile', screenProfile, 'profile'],
    ['soon/:name', screenSoon],
    ['send', screenSendHub],
    ['send/form', screenSendForm],
    ['send/review', screenSendReview],
    ['load', screenLoadForm],
    ['load/promos', screenLoadPromos],
    ['load/review', screenLoadReview],
    ['bills', screenBillCategories],
    ['bills/category/:cat', screenBillerList],
    ['bills/biller/:biller', screenBillForm],
    ['bills/review', screenBillReview],
    ['bank', screenBankList],
    ['bank/form/:bank', screenBankForm],
    ['bank/review', screenBankReview],
    ['bank/otp', screenBankOtp],
    ['result', screenResult],
  ];

  function matchRoute(pattern, path) {
    const pp = pattern.split('/'), xs = path.split('/');
    if (pp.length !== xs.length) return null;
    const params = {};
    for (let i = 0; i < pp.length; i++) {
      if (pp[i][0] === ':') params[pp[i].slice(1)] = decodeURIComponent(xs[i]);
      else if (pp[i] !== xs[i]) return null;
    }
    return params;
  }
  const currentPath = () => location.hash.replace(/^#\/?/, '');
  function go(path) {
    if (currentPath() === path) render();
    else location.hash = '#/' + path;
  }
  function redirect(path) {
    location.replace('#/' + path);
    return null;
  }

  let timers = [];
  function clearTimers() { timers.forEach(id => { clearTimeout(id); clearInterval(id); }); timers = []; }

  function render() {
    clearTimers();
    const path = currentPath();
    if (!path) return redirect(S.loggedIn ? 'home' : 'login');
    if (!S.loggedIn && path !== 'login') return redirect('login');
    if (S.loggedIn && path === 'login') return redirect('home');

    for (const [pattern, fn, tab] of ROUTES) {
      const params = matchRoute(pattern, path);
      if (!params) continue;
      const out = fn(params);
      if (out == null) return; // screen redirected
      const view = typeof out === 'string' ? { html: out } : out;
      closeModal(true);
      $$('.toast.sms', toastRoot).forEach(t => t.remove());
      screenEl.innerHTML = view.html;
      screenEl.scrollTop = 0;
      screenEl.dataset.screen = pattern;
      device.dataset.screen = pattern;
      navEl.hidden = !tab;
      $$('[data-tab]', navEl).forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      applyFocus();
      save();
      if (view.after) view.after();
      emit('app:screen', { route: pattern, path, params });
      return;
    }
    redirect(S.loggedIn ? 'home' : 'login');
  }

  /* ---------------- shared UI pieces ---------------- */
  function appbar(title, back, right = '') {
    const backBtn = back
      ? `<button class="icon-btn" data-action="nav" data-to="${back}" data-guide="nav.back" aria-label="Back">${icon('chevron-left')}</button>`
      : '<span class="icon-btn-spacer"></span>';
    return `<header class="appbar">${backBtn}<h1>${esc(title)}</h1>${right || '<span class="icon-btn-spacer"></span>'}</header>`;
  }

  function field(o) {
    const { name, label, value = '', placeholder = '', type = 'text', inputmode, prefix, hint, maxlength, guide, autocomplete = 'off', extra = '' } = o;
    return `<div class="field" data-field="${name}">
      <label for="f-${name}">${label}</label>
      <div class="input-wrap">
        ${prefix ? `<span class="prefix">${prefix}</span>` : ''}
        <input class="input${prefix ? ' has-prefix' : ''}${extra ? ' has-suffix' : ''}" id="f-${name}" name="${name}" type="${type}"
          ${inputmode ? `inputmode="${inputmode}"` : ''} ${maxlength ? `maxlength="${maxlength}"` : ''}
          placeholder="${esc(placeholder)}" value="${esc(value)}" autocomplete="${autocomplete}" data-guide="${guide || name}">
        ${extra}
      </div>
      ${hint ? `<p class="hint">${hint}</p>` : ''}
      <p class="field-error" role="alert" data-guide="${guide || name}.error"></p>
    </div>`;
  }

  function showErrors(form, errors) {
    $$('.field', form).forEach(f => { f.classList.remove('invalid'); const e = $('.field-error', f); if (e) e.innerHTML = ''; });
    const entries = Object.entries(errors);
    entries.forEach(([name, msg]) => {
      const f = $(`.field[data-field="${name}"]`, form);
      if (!f) { toast(esc(msg)); return; }
      f.classList.add('invalid');
      $('.field-error', f).innerHTML = icon('alert', 14) + `<span>${esc(msg)}</span>`;
      emit('app:error', { screen: screenEl.dataset.screen, field: name, message: msg });
    });
    if (entries.length) { const first = $('.field.invalid input', form); if (first) first.focus(); }
    return entries.length === 0;
  }

  const formValues = f => Object.fromEntries(new FormData(f).entries());
  const kv = (k, v) => `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`;
  const contactBtn = target => `<button type="button" class="input-icon" data-action="pick-contact" data-target="${target}" data-guide="contacts.open" aria-label="Choose from contacts">${icon('contacts', 20)}</button>`;

  function reviewBlock(label, amount, rows, total) {
    return `<div class="review">
      <div class="review-amount" data-guide="review.amount"><p>${esc(label)}</p><h2>${fmt(amount)}</h2></div>
      <div class="card" data-guide="review.details">
        ${rows.map(([k, v]) => kv(k, v)).join('')}
        <div class="kv total"><span>Total amount</span><span>${fmt(total)}</span></div>
      </div>
      <p class="fine warn" data-guide="review.warning">${icon('alert', 14)}<span>Please review all details before you continue. Completed transactions can no longer be cancelled or reversed.</span></p>
    </div>`;
  }

  function hubItem(to, ic, title, sub, guide) {
    return `<button class="list-item" data-action="nav" data-to="${to}" data-guide="${guide}">
      <span class="avatar">${icon(ic, 20)}</span>
      <span class="li-main"><span class="li-title">${esc(title)}</span><span class="li-sub">${esc(sub)}</span></span>
      ${icon('chevron-right', 18)}
    </button>`;
  }

  /* ---------------- modals, dialogs, toasts ---------------- */
  let modalName = null;
  let dialogCb = null;
  function openModal(inner, { name = 'modal', center = false, dismiss = true } = {}) {
    modalRoot.innerHTML = `<div class="modal-backdrop${center ? ' center' : ''}" data-modal="${name}" ${dismiss ? 'data-action="backdrop"' : ''}>${inner}</div>`;
    modalName = name;
    emit('app:modal', { name, open: true });
  }
  function closeModal(quiet) {
    if (!modalName) return;
    const n = modalName;
    modalRoot.innerHTML = '';
    modalName = null;
    if (pin.ctx === 'mpin') pin = { buf: '', ctx: null, onOk: null };
    if (!quiet) emit('app:modal', { name: n, open: false });
  }
  function dialog({ title, message, ok = 'OK', cancel, danger = false, name = 'dialog', onOk }) {
    dialogCb = onOk || null;
    openModal(`<div class="dialog" data-guide="dialog">
      <h3>${esc(title)}</h3><p>${esc(message)}</p>
      <div class="dialog-btns">
        ${cancel ? `<button class="btn ghost" data-action="modal-close" data-guide="dialog.cancel">${esc(cancel)}</button>` : ''}
        <button class="btn${danger ? ' danger' : ''}" data-action="dialog-ok" data-guide="dialog.ok">${esc(ok)}</button>
      </div></div>`, { name, center: true, dismiss: !!cancel });
  }
  function showLoading(text) {
    openModal(`<div class="loading-box" data-guide="loading"><div class="spinner"></div><p>${esc(text)}</p></div>`, { name: 'loading', center: true, dismiss: false });
  }
  function toast(html, { sms = false, duration = 3200 } = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (sms ? ' sms' : '');
    el.dataset.guide = sms ? 'toast.sms' : 'toast';
    el.innerHTML = sms ? `<div class="sms-head">${icon('mail', 14)} Messages · now</div><div>${html}</div>` : html;
    toastRoot.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, duration);
    emit('app:toast', { text: el.textContent.trim(), sms });
  }
  function soon(name) { toast(`<b>${esc(name)}</b> is not available in this prototype.`); }

  /* ---------------- MPIN keypad (login + transaction confirm) ---------------- */
  let pin = { buf: '', ctx: null, onOk: null };
  const pinDots = ctx => `<div class="pin-dots" id="pin-dots" data-guide="${ctx}.pin-dots">${'<i></i>'.repeat(4)}</div>`;
  function keypad(ctx) {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
    return `<div class="keypad" data-guide="${ctx}.keypad">${keys.map(k => {
      if (k === '') return '<span></span>';
      if (k === 'del') return `<button class="key" data-action="pin-del" aria-label="Delete" data-guide="${ctx}.key-del">${icon('delete')}</button>`;
      return `<button class="key" data-action="pin-key" data-key="${k}" data-guide="${ctx}.key-${k}">${k}</button>`;
    }).join('')}</div>`;
  }
  function pinStart(ctx, onOk) { pin = { buf: '', ctx, onOk }; drawPin(); }
  function drawPin() { $$('#pin-dots i').forEach((d, i) => d.classList.toggle('on', i < pin.buf.length)); }
  function setPinMsg(m) { const el = $('#pin-msg'); if (el) el.textContent = m; }
  const isLocked = () => S.lockedUntil > Date.now();

  function pinKey(k) {
    if (!pin.ctx) return;
    if (isLocked()) return updateLockUI();
    if (pin.buf.length >= 4) return;
    pin.buf += k;
    drawPin();
    if (pin.buf.length === 4) setTimeout(checkPin, 180);
  }
  function pinDel() { if (!pin.ctx) return; pin.buf = pin.buf.slice(0, -1); drawPin(); }

  function checkPin() {
    if (!pin.ctx) return;
    if (pin.buf === USER.mpin) {
      S.pinAttempts = 0;
      const ok = pin.onOk;
      pin = { buf: '', ctx: null, onOk: null };
      save();
      if (ok) ok();
      return;
    }
    S.pinAttempts++;
    const left = 3 - S.pinAttempts;
    let msg = `Incorrect MPIN. You have ${left} remaining attempt${left === 1 ? '' : 's'}.`;
    if (left <= 0) {
      S.lockedUntil = Date.now() + 30000;
      S.pinAttempts = 0;
      msg = 'Your account is temporarily locked due to multiple incorrect MPIN attempts.';
    }
    save();
    pin.buf = '';
    const dots = $('#pin-dots');
    if (dots) { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); }
    drawPin();
    setPinMsg(msg);
    emit('app:error', { screen: pin.ctx, field: 'mpin', message: msg });
    if (isLocked()) updateLockUI();
  }

  function updateLockUI() {
    if (!isLocked()) return;
    const tick = () => {
      if (!$('#pin-msg')) return true;
      const s = Math.ceil((S.lockedUntil - Date.now()) / 1000);
      const keys = $$('.keypad .key');
      if (s <= 0) { setPinMsg(''); keys.forEach(b => (b.disabled = false)); return true; }
      setPinMsg(`Your account is temporarily locked due to multiple incorrect MPIN attempts. Please try again in ${s} second${s === 1 ? '' : 's'}.`);
      keys.forEach(b => (b.disabled = true));
      return false;
    };
    if (!tick()) { const id = setInterval(() => { if (tick()) clearInterval(id); }, 1000); timers.push(id); }
  }

  function askMpin(onOk) {
    openModal(`<div class="sheet pin-sheet" data-guide="mpin.sheet">
      <div class="sheet-head"><h2>Enter your MPIN</h2>
        <button class="icon-btn" data-action="modal-close" data-guide="mpin.close" aria-label="Close">${icon('x')}</button></div>
      <p class="sheet-sub">For your security, enter your 4-digit MPIN to authorize this transaction.</p>
      ${pinDots('mpin')}<p class="pin-msg" id="pin-msg" data-guide="mpin.message"></p>${keypad('mpin')}
    </div>`, { name: 'mpin' });
    pinStart('mpin', () => { closeModal(); onOk(); });
    updateLockUI();
  }

  /* ---------------- transaction processing ---------------- */
  function processTxn(kind, txn, retryPath, delay = 1400) {
    showLoading('Processing your transaction…');
    setTimeout(() => {
      closeModal();
      if (S.failNext) {
        S.failNext = false;
        S.last = {
          ok: false, kind, retry: retryPath, code: 'TXN-5003',
          message: 'We are unable to process your request at this time due to a system error. Please try again later.',
        };
        emit('app:error', { screen: 'result', field: null, message: S.last.message, code: S.last.code });
        emit('app:transaction', { ok: false, kind });
        save();
        return go('result');
      }
      S.balance = round2(S.balance - txn.total);
      const rec = { ...txn, kind, id: refNo(), ref: refNo(), date: new Date().toISOString(), amount: -txn.total };
      S.txns.unshift(rec);
      S.draft[kind] = null;
      S.last = { ok: true, kind, txn: rec };
      emit('app:transaction', { ok: true, kind, txn: rec });
      save();
      go('result');
    }, delay);
  }

  /* =======================================================================
     SCREENS
     ======================================================================= */

  /* ---------- Login ---------- */
  function screenLogin() {
    return {
      html: `<div class="login" data-guide="login">
        <div class="login-brand">${icon('wallet', 28)}<span>${esc(BRAND.name)}</span></div>
        <div class="login-user">
          <div class="avatar lg">${initials(USER.fullName)}</div>
          <p class="login-hello">Hello, ${esc(USER.firstName)}!</p>
          <p class="login-num">+63 ${fmtMobile(USER.mobile).slice(1)}</p>
        </div>
        <p class="login-label">Enter your 4-digit MPIN</p>
        ${pinDots('login')}
        <p class="pin-msg" id="pin-msg" data-guide="login.message"></p>
        ${keypad('login')}
        <div class="login-links">
          <button class="link light" data-action="soon" data-name="Forgot MPIN" data-guide="login.forgot">Forgot MPIN?</button>
          <button class="link light" data-action="soon" data-name="Switch account" data-guide="login.switch">Not you?</button>
        </div>
        <p class="demo-hint">Prototype · demo MPIN is <b>${USER.mpin}</b></p>
      </div>`,
      after() {
        pinStart('login', () => { S.loggedIn = true; S.promoSeen = false; save(); go('home'); });
        updateLockUI();
      },
    };
  }

  /* ---------- Home ---------- */
  /* Focus mode: home-screen buttons that stay sharp when blurring is on. */
  const FOCUS_KEEP = ['send', 'load', 'transfer', 'bills'];
  function applyFocus() {
    const btn = $('#focus-toggle');
    const on = !!S.focusMode;
    device.classList.toggle('focus-on', on);
    if (!btn) return;
    btn.hidden = currentPath() !== 'home';
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('active', on);
    $('#focus-toggle-label').textContent = on ? 'Focus: On' : 'Focus: Off';
  }

  function partOfDay() { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; }
  function screenHome() {
    const svc = s => `<button class="svc${FOCUS_KEEP.includes(s.id) ? ' keep' : ''}" data-action="${s.to ? 'nav' : 'soon'}" ${s.to ? `data-to="${s.to}"` : `data-name="${s.label}"`} data-guide="home.svc-${s.id}">
        <span class="ic">${icon(s.icon, 22)}${s.badge ? `<span class="badge-new">${s.badge}</span>` : ''}</span><span>${s.label}</span></button>`;
    return {
      html: `<div class="home">
        <div class="home-top">
          <div class="home-row">
            <button class="avatar sm" data-action="nav" data-to="profile" data-guide="home.avatar">${initials(USER.fullName)}</button>
            <div class="hello"><small>Good ${partOfDay()},</small><b>${esc(USER.firstName.toUpperCase())}</b></div>
            <button class="icon-btn" data-action="soon" data-name="Help Center" data-guide="home.help" aria-label="Help">${icon('help')}</button>
            <button class="icon-btn notif" data-action="nav" data-to="inbox" data-guide="home.notifications" aria-label="Notifications">${icon('bell')}<span class="dot">9+</span></button>
          </div>
          <div class="bal" data-guide="home.balance">
            <div class="bal-label">AVAILABLE BALANCE
              <button class="eye" data-action="toggle-balance" data-guide="home.balance-toggle" aria-label="Show or hide balance">${icon(S.hideBalance ? 'eye-off' : 'eye', 16)}</button></div>
            <div class="bal-row">
              <div class="bal-amt">${S.hideBalance ? '₱ ••••••' : fmt(S.balance)}</div>
              <button class="cashin" data-action="soon" data-name="Cash In" data-guide="home.cashin">${icon('plus', 14)} Cash In</button>
            </div>
          </div>
        </div>
        <div class="svc-card" data-guide="home.services"><div class="svc-grid">${HOME_SERVICES.map(svc).join('')}</div></div>
        <div class="section-head"><p class="section-title">Promos for you</p><button class="link" data-action="soon" data-name="Promos" data-guide="home.promos-all">See all</button></div>
        <div class="carousel" data-guide="home.banners">${BANNERS.map((b, i) => `<button class="banner" style="background:${b.bg}" data-action="soon" data-name="${esc(b.title)}" data-guide="home.banner-${i}"><b>${esc(b.title)}</b><span>${esc(b.text)}</span><em>Learn more ›</em></button>`).join('')}</div>
        <div class="section-head"><p class="section-title">Recent activity</p><button class="link" data-action="nav" data-to="transactions" data-guide="home.see-transactions">See all</button></div>
        <div class="list">${S.txns.slice(0, 3).map(txnRow).join('')}</div>
        <p class="home-foot">${esc(BRAND.name)} · ISCS 30.17 prototype (not a real app)</p>
      </div>`,
      after() { if (!S.promoSeen) timers.push(setTimeout(showPromoPopup, 700)); },
    };
  }
  function showPromoPopup() {
    S.promoSeen = true;
    save();
    openModal(`<div class="promo-pop" data-guide="popup.ad">
      <button class="promo-x" data-action="modal-close" data-guide="popup.close" aria-label="Close">${icon('x', 14)}</button>
      <div class="promo-art">${icon('gift', 54)}</div>
      <h3>SPIN TO WIN up to ₱10,000!</h3>
      <p>Pay bills or buy load worth ₱100 or more this month and get a FREE spin. Promo runs until Nov 30 only!</p>
      <button class="btn" data-action="soon" data-name="Spin to Win" data-guide="popup.cta">Join Now</button>
      <label class="dont"><input type="checkbox" data-guide="popup.dont-show"> Don't show this again</label>
    </div>`, { name: 'promo', center: true });
  }

  /* ---------- View all services (nested menu) ---------- */
  function screenServices() {
    return `${appbar('All Services', 'home')}
      <div class="search-wrap"><div class="search">${icon('search', 18)}<input class="search-input" placeholder="Search services" data-guide="services.search" id="svc-search"></div></div>
      ${ALL_SERVICES.map(sec => `<p class="section-title pad">${esc(sec.title)}</p>
        <div class="svc-card flat"><div class="svc-grid">${sec.items.map(it => `<button class="svc" data-search="${esc(it.label.toLowerCase())}" data-action="${it.to ? 'nav' : 'soon'}" ${it.to ? `data-to="${it.to}"` : `data-name="${esc(it.label)}"`} data-guide="services.${it.label.toLowerCase().replace(/\W+/g, '-')}">
          <span class="ic">${icon(it.icon, 22)}</span><span>${esc(it.label)}</span></button>`).join('')}</div></div>`).join('')}
      <div class="spacer"></div>`;
  }

  /* ---------- Inbox / Transactions / Profile / Coming soon ---------- */
  function screenInbox() {
    return `${appbar('Inbox', null)}
      <div class="list">${INBOX.map(m => `<button class="list-item" data-action="msg-open" data-id="${m.id}" data-guide="inbox.${m.id}">
        <span class="avatar">${icon('mail', 18)}</span>
        <span class="li-main"><span class="li-title">${m.unread ? '<i class="unread"></i>' : ''}${esc(m.title)}</span><span class="li-sub clamp">${esc(m.body)}</span></span>
        <span class="li-time">${esc(m.time)}</span></button>`).join('')}</div>`;
  }
  const TXN_ICON = { send: 'send', load: 'smartphone', bill: 'receipt', bank: 'landmark', cashin: 'plus' };
  function txnRow(t) {
    return `<button class="list-item" data-action="txn-open" data-id="${t.id}" data-guide="transactions.item">
      <span class="avatar">${icon(TXN_ICON[t.kind] || 'wallet', 18)}</span>
      <span class="li-main"><span class="li-title">${esc(t.title)}</span><span class="li-sub">${fmtDate(t.date)}</span></span>
      <span class="li-amt ${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+' : '-'}${fmt(Math.abs(t.amount))}</span></button>`;
  }
  function screenTransactions() {
    return `${appbar('Transactions', null)}
      <div class="balance-strip">Available balance <b>${fmt(S.balance)}</b></div>
      <div class="list">${S.txns.length ? S.txns.map(txnRow).join('') : '<p class="empty-row">No transactions yet.</p>'}</div>`;
  }
  function screenProfile() {
    const row = (ic, label, action, extra = '') => `<button class="list-item" data-action="${action}" ${extra} data-guide="profile.${label.toLowerCase().replace(/\W+/g, '-')}">
      <span class="avatar">${icon(ic, 18)}</span><span class="li-main"><span class="li-title">${label}</span></span>${icon('chevron-right', 18)}</button>`;
    return `${appbar('Profile', null)}
      <div class="profile-head">
        <div class="avatar xl">${initials(USER.fullName)}</div>
        <h2>${esc(USER.fullName)}</h2>
        <p>+63 ${fmtMobile(USER.mobile).slice(1)}</p>
        <span class="verified">${icon('badge-check', 14)} Fully Verified</span>
      </div>
      <div class="list">
        ${row('user', 'Account Details', 'soon', 'data-name="Account Details"')}
        ${row('sliders', 'Account Limits', 'soon', 'data-name="Account Limits"')}
        ${row('lock', 'Security & MPIN', 'soon', 'data-name="Security"')}
        ${row('help', 'Help Center', 'soon', 'data-name="Help Center"')}
      </div>
      <div class="list">${row('logout', 'Log Out', 'logout')}</div>
      <p class="home-foot">Tip for testers: run <code>App.failNext()</code> in the console to make the next transaction fail.</p>`;
  }
  function screenSoon({ name }) {
    return `${appbar(name, 'home')}
      <div class="empty">
        <div class="empty-ic">${icon('grid', 36)}</div>
        <h2>${esc(name)}</h2>
        <p>This feature is not part of the prototype.</p>
        <button class="btn" data-action="nav" data-to="home" data-guide="soon.home">Back to Home</button>
      </div>`;
  }

  /* ---------- SEND MONEY ---------- */
  function screenSendHub() {
    return `${appbar('Send Money', 'home')}
      <div class="list">
        ${hubItem('send/form', 'send', 'Express Send', `Send to any ${BRAND.name} account instantly`, 'send.express')}
        ${hubItem('bank', 'landmark', 'Send to Bank', 'Transfer to banks and e-wallets via InstaPay', 'send.bank')}
        ${hubItem('soon/Send via QR', 'qr', 'Send via QR', 'Scan a QR code to send money', 'send.qr')}
        ${hubItem('soon/Send with a Clip', 'gift', 'Send with a Clip', 'Add a GIF or video message', 'send.clip')}
        ${hubItem('soon/Request Money', 'mail', 'Request Money', 'Ask someone to send you money', 'send.request')}
      </div>
      <p class="section-title pad">Recent recipients</p>
      <div class="list">${CONTACTS.map(c => `<button class="list-item" data-action="send-to" data-mobile="${c.mobile}" data-guide="send.recent">
        <span class="avatar">${initials(c.name)}</span>
        <span class="li-main"><span class="li-title">${esc(c.name)}</span><span class="li-sub">${fmtMobile(c.mobile)}</span></span>${icon('chevron-right', 18)}</button>`).join('')}</div>`;
  }

  function screenSendForm() {
    const d = S.draft.send || {};
    return `${appbar('Express Send', 'send')}
      <form data-form="send" novalidate>
        <div class="balance-strip">Available balance <b>${fmt(S.balance)}</b></div>
        <div class="card">
          ${field({ name: 'mobile', label: 'Mobile number', value: fmtMobile(d.mobile), placeholder: '09XX XXX XXXX', type: 'tel', inputmode: 'numeric', maxlength: 13, guide: 'send.mobile', extra: contactBtn('mobile') })}
          ${field({ name: 'amount', label: 'Amount', value: d.amount ? d.amount.toFixed(2) : '', placeholder: '0.00', inputmode: 'decimal', prefix: '₱', guide: 'send.amount' })}
          ${field({ name: 'message', label: 'Message (optional)', value: d.message || '', placeholder: 'Write a message', maxlength: 60, guide: 'send.message' })}
        </div>
        <p class="fine">Sending to ${esc(BRAND.name)} accounts is free. Double-check the number before you send; transfers to the wrong number cannot be reversed.</p>
        <div class="footer"><button class="btn" type="submit" data-guide="send.next">Next</button></div>
      </form>`;
  }
  function submitSend(form) {
    const v = formValues(form);
    const mobile = normMobile(v.mobile);
    const amount = parseAmount(v.amount);
    const errs = {};
    if (!digits(v.mobile)) errs.mobile = 'Please enter a mobile number.';
    else if (!validMobile(mobile)) errs.mobile = 'Invalid mobile number. Enter an 11-digit number that starts with 09.';
    else if (mobile === USER.mobile) errs.mobile = 'You cannot send money to your own account.';
    else if (mobile.endsWith('0000')) errs.mobile = `This number is not registered with ${BRAND.name}. Ask the recipient to register first.`;
    const ae = amountError(amount, { min: 1, max: 50000 });
    if (ae) errs.amount = ae;
    if (!showErrors(form, errs)) return;
    S.draft.send = { mobile, amount, message: (v.message || '').trim(), name: recipientName(mobile) };
    go('send/review');
  }
  function screenSendReview() {
    const d = S.draft.send;
    if (!d || !d.amount) return redirect('send/form');
    const rows = [['Send to', d.name], ['Mobile number', fmtMobile(d.mobile)], ['Amount', fmt(d.amount)], ['Transaction fee', 'Free']];
    if (d.message) rows.push(['Message', d.message]);
    return `${appbar('Review', 'send/form')}
      ${reviewBlock('You are about to send', d.amount, rows, d.amount)}
      <div class="footer">
        <button class="btn" data-action="confirm" data-kind="send" data-guide="review.confirm">Send ${fmt(d.amount)}</button>
        <button class="btn ghost" data-action="nav" data-to="send/form" data-guide="review.edit">Edit details</button>
      </div>`;
  }

  /* ---------- BUY LOAD ---------- */
  function netLabel(net) {
    return net ? `${icon('check', 14)} Network detected: <b>${net}</b>` : `${icon('alert', 14)} We couldn't detect the network. Please select it below.`;
  }
  function screenLoadForm() {
    const d = S.draft.load || { mobile: USER.mobile };
    const net = detectNetwork(d.mobile);
    return `${appbar('Buy Load', 'home')}
      <form data-form="load" novalidate>
        <div class="card">
          ${field({ name: 'mobile', label: 'Mobile number to load', value: fmtMobile(d.mobile), placeholder: '09XX XXX XXXX', type: 'tel', inputmode: 'numeric', maxlength: 13, guide: 'load.mobile', extra: contactBtn('mobile') })}
          <p class="net-detect ${net ? 'ok' : ''}" id="net-detect" data-guide="load.network">${d.mobile ? netLabel(net) : ''}</p>
          <button type="button" class="chip" data-action="load-self" data-guide="load.self">Use my number</button>
        </div>
        <div class="card" id="net-pick" ${net || !d.mobile ? 'hidden' : ''}>
          <div class="field" data-field="network">
            <label>Select network</label>
            <div class="chip-row">${NETWORKS.map(n => `<label class="chip radio"><input type="radio" name="network" value="${n}" ${d.network === n ? 'checked' : ''} data-guide="load.network-${n.toLowerCase()}"><span>${n}</span></label>`).join('')}</div>
            <p class="field-error" role="alert" data-guide="load.network.error"></p>
          </div>
        </div>
        <div class="footer"><button class="btn" type="submit" data-guide="load.next">Next</button></div>
      </form>`;
  }
  function updateNetDetect(value) {
    const m = normMobile(value);
    const el = $('#net-detect'), pick = $('#net-pick');
    if (!el) return;
    if (!validMobile(m)) { el.innerHTML = ''; el.className = 'net-detect'; if (pick) pick.hidden = true; return; }
    const net = detectNetwork(m);
    el.innerHTML = netLabel(net);
    el.className = 'net-detect' + (net ? ' ok' : '');
    if (pick) pick.hidden = !!net;
  }
  function submitLoad(form) {
    const v = formValues(form);
    const mobile = normMobile(v.mobile);
    const errs = {};
    if (!digits(v.mobile)) errs.mobile = 'Please enter the mobile number you want to load.';
    else if (!validMobile(mobile)) errs.mobile = 'Invalid mobile number. Enter an 11-digit number that starts with 09.';
    const network = validMobile(mobile) ? (detectNetwork(mobile) || v.network) : null;
    if (validMobile(mobile) && !network) errs.network = 'Please select the network of this number.';
    if (!showErrors(form, errs)) return;
    const prev = S.draft.load || {};
    S.draft.load = { mobile, network, tab: prev.tab || 'regular' };
    go('load/promos');
  }
  function screenLoadPromos() {
    const d = S.draft.load;
    if (!d || !d.mobile) return redirect('load');
    const tab = d.tab || 'regular';
    const tabBtn = (id, label) => `<button class="tab ${tab === id ? 'active' : ''}" data-action="load-tab" data-tab="${id}" data-guide="load.tab-${id}">${label}</button>`;
    let body;
    if (tab === 'regular') {
      body = `<div class="card">
          <p class="label">Choose an amount</p>
          <div class="amt-grid">${REGULAR_LOAD_AMOUNTS.map(a => `<button class="amt" data-action="load-pick" data-amount="${a}" data-guide="load.amount-${a}">₱${a}</button>`).join('')}</div>
        </div>
        <form class="card" data-form="load-custom" novalidate>
          ${field({ name: 'amount', label: 'Or enter another amount (₱10 – ₱1,000)', placeholder: '0', inputmode: 'numeric', prefix: '₱', guide: 'load.custom-amount' })}
          <button class="btn" type="submit" data-guide="load.custom-next">Buy Load</button>
        </form>`;
    } else {
      body = `<div class="list">${LOAD_PROMOS[tab].map(p => `<button class="list-item promo" data-action="load-pick" data-promo="${p.id}" data-guide="load.promo-${p.id}">
          <span class="li-main"><span class="li-title">${esc(p.name)}</span><span class="li-sub">${esc(p.desc)}</span></span>
          <span class="price">${fmt(p.price)}</span></button>`).join('')}</div>`;
    }
    return `${appbar('Buy Load', 'load')}
      <div class="load-target" data-guide="load.target">
        <span class="avatar">${icon('smartphone', 18)}</span>
        <span class="li-main"><span class="li-title">${fmtMobile(d.mobile)}</span><span class="li-sub">${esc(d.network)}</span></span>
        <button class="link" data-action="nav" data-to="load" data-guide="load.change">Change</button>
      </div>
      <div class="tabs">${tabBtn('regular', 'Regular')}${tabBtn('data', 'Data')}${tabBtn('call', 'Call & Text')}</div>
      ${body}`;
  }
  function pickLoad(amount, promo) {
    const d = S.draft.load;
    if (!d) return go('load');
    const price = promo ? promo.price : amount;
    if (price > S.balance) {
      const msg = `Insufficient balance. Your available balance is ${fmt(S.balance)}.`;
      toast(esc(msg));
      emit('app:error', { screen: 'load/promos', field: 'amount', message: msg });
      return;
    }
    d.amount = price;
    d.promo = promo ? { name: promo.name, desc: promo.desc } : { name: `Regular ₱${amount}`, desc: 'Regular load (no expiry)' };
    go('load/review');
  }
  function screenLoadReview() {
    const d = S.draft.load;
    if (!d || !d.amount) return redirect('load');
    const rows = [['Mobile number', fmtMobile(d.mobile)], ['Network', d.network], ['Load', d.promo.name], ['Details', d.promo.desc], ['Amount', fmt(d.amount)], ['Convenience fee', 'Free']];
    return `${appbar('Review', 'load/promos')}
      ${reviewBlock('You are buying load worth', d.amount, rows, d.amount)}
      <div class="footer">
        <button class="btn" data-action="confirm" data-kind="load" data-guide="review.confirm">Buy for ${fmt(d.amount)}</button>
        <button class="btn ghost" data-action="nav" data-to="load/promos" data-guide="review.edit">Choose a different load</button>
      </div>`;
  }

  /* ---------- PAY BILLS ---------- */
  function billerRow(b) {
    return `<button class="list-item" data-search="${esc(b.name.toLowerCase())}" data-action="nav" data-to="bills/biller/${b.id}" data-guide="bills.biller-${b.id}">
      <span class="avatar">${initials(b.name)}</span>
      <span class="li-main"><span class="li-title">${esc(b.name)}</span></span>${icon('chevron-right', 18)}</button>`;
  }
  function screenBillCategories() {
    const saved = S.savedBillers.map((sb, i) => {
      const b = BILLER_BY_ID[sb.billerId];
      return `<button class="list-item" data-action="saved-biller" data-index="${i}" data-guide="bills.saved-${b.id}">
        <span class="avatar">${initials(b.name)}</span>
        <span class="li-main"><span class="li-title">${esc(b.name)}</span><span class="li-sub">${esc(sb.accountName)} · ${esc(sb.account)}</span></span>${icon('chevron-right', 18)}</button>`;
    }).join('');
    return `${appbar('Pay Bills', 'home')}
      <div class="search-wrap"><div class="search">${icon('search', 18)}<input class="search-input" id="biller-search" placeholder="Search for a biller" data-guide="bills.search"></div></div>
      <div id="search-results" hidden></div>
      <div id="cat-wrap">
        ${saved ? `<p class="section-title pad">Saved billers</p><div class="list">${saved}</div>` : ''}
        <p class="section-title pad">Biller categories</p>
        <div class="cat-grid">${BILL_CATEGORIES.map(c => `<button class="cat" data-action="nav" data-to="bills/category/${c.id}" data-guide="bills.cat-${c.id}">
          <span class="ic">${icon(c.icon, 22)}</span><span>${esc(c.name)}</span></button>`).join('')}</div>
      </div>`;
  }
  function searchBillers(q) {
    q = q.trim().toLowerCase();
    const out = $('#search-results'), wrap = $('#cat-wrap');
    if (!out) return;
    out.hidden = !q;
    wrap.hidden = !!q;
    if (!q) return;
    const hits = ALL_BILLERS.filter(b => b.name.toLowerCase().includes(q));
    out.innerHTML = hits.length
      ? `<div class="list">${hits.map(billerRow).join('')}</div>`
      : `<p class="empty-row" data-guide="search.empty">No billers found for “${esc(q)}”. Check the spelling or browse the categories.</p>`;
  }
  function screenBillerList({ cat }) {
    const c = BILL_CATEGORIES.find(c => c.id === cat);
    if (!c) return redirect('bills');
    return `${appbar(c.name, 'bills')}
      <div class="search-wrap"><div class="search">${icon('search', 18)}<input class="search-input" data-filter="list" placeholder="Search in ${esc(c.name)}" data-guide="bills.category-search"></div></div>
      <div class="list filterable">${c.billers.map(billerRow).join('')}</div>
      <p class="empty-row" id="no-results" hidden>No billers match your search.</p>`;
  }
  function screenBillForm({ biller }) {
    const b = BILLER_BY_ID[biller];
    if (!b) return redirect('bills');
    const d = S.draft.bill && S.draft.bill.billerId === b.id ? S.draft.bill : {};
    return `${appbar(b.name, `bills/category/${b.category}`)}
      <form data-form="bill" data-biller="${b.id}" novalidate>
        <div class="biller-head"><span class="avatar lg">${initials(b.name)}</span><b>${esc(b.name)}</b></div>
        <div class="card">
          ${field({ name: 'account', label: b.field, value: d.account || '', placeholder: `${b.len}-digit number`, inputmode: 'numeric', maxlength: b.len + 4, hint: esc(b.hint), guide: 'bill.account' })}
          ${field({ name: 'accountName', label: 'Account name', value: d.accountName || '', placeholder: 'Name on the bill', guide: 'bill.account-name' })}
          ${field({ name: 'amount', label: 'Amount', value: d.amount ? d.amount.toFixed(2) : '', placeholder: '0.00', inputmode: 'decimal', prefix: '₱', guide: 'bill.amount' })}
          ${field({ name: 'email', label: 'Email address (optional)', value: d.email || '', placeholder: 'For your e-receipt', type: 'email', guide: 'bill.email' })}
          <label class="check"><input type="checkbox" name="save" ${d.save ? 'checked' : ''} data-guide="bill.save"> Save this biller for next time</label>
        </div>
        <p class="fine">${b.fee ? `A convenience fee of ${fmt(b.fee)} will be charged.` : 'No convenience fee.'} Payments made after 10:00 PM are posted on the next banking day.</p>
        <div class="footer"><button class="btn" type="submit" data-guide="bill.next">Next</button></div>
      </form>`;
  }
  function submitBill(form) {
    const b = BILLER_BY_ID[form.dataset.biller];
    const v = formValues(form);
    const acct = String(v.account || '').replace(/[\s-]/g, '');
    const amount = parseAmount(v.amount);
    const label = b.short || 'account number';
    const errs = {};
    if (!acct) errs.account = `Please enter your ${b.field}.`;
    else if (!/^\d+$/.test(acct)) errs.account = `Invalid ${label}. It must contain numbers only.`;
    else if (acct.length !== b.len) errs.account = `Invalid ${label}. It must be exactly ${b.len} digits (you entered ${acct.length}).`;
    if (!String(v.accountName || '').trim()) errs.accountName = 'Please enter the account name.';
    const ae = amountError(amount, { min: 1, max: 100000, fee: b.fee });
    if (ae) errs.amount = ae;
    const email = String(v.email || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Please enter a valid email address (e.g. name@email.com).';
    if (!showErrors(form, errs)) return;
    S.draft.bill = { billerId: b.id, account: acct, accountName: v.accountName.trim().toUpperCase(), amount, email, save: !!v.save, fee: b.fee };
    go('bills/review');
  }
  function screenBillReview() {
    const d = S.draft.bill;
    if (!d || !d.amount) return redirect('bills');
    const b = BILLER_BY_ID[d.billerId];
    const rows = [['Biller', b.name], [b.field, d.account], ['Account name', d.accountName], ['Amount', fmt(d.amount)], ['Convenience fee', d.fee ? fmt(d.fee) : 'Free']];
    if (d.email) rows.push(['Send receipt to', d.email]);
    return `${appbar('Review', `bills/biller/${b.id}`)}
      ${reviewBlock(`You are paying ${b.name}`, d.amount, rows, d.amount + d.fee)}
      <div class="footer">
        <button class="btn" data-action="confirm" data-kind="bill" data-guide="review.confirm">Pay ${fmt(d.amount + d.fee)}</button>
        <button class="btn ghost" data-action="nav" data-to="bills/biller/${b.id}" data-guide="review.edit">Edit details</button>
      </div>`;
  }

  /* ---------- BANK TRANSFER ---------- */
  function bankRow(b) {
    return `<button class="list-item" data-search="${esc(b.name.toLowerCase())}" data-action="nav" data-to="bank/form/${b.id}" data-guide="bank.bank-${b.id}">
      <span class="avatar">${icon('landmark', 18)}</span>
      <span class="li-main"><span class="li-title">${esc(b.name)}</span></span>${icon('chevron-right', 18)}</button>`;
  }
  function screenBankList() {
    return `${appbar('Bank Transfer', 'home')}
      <div class="search-wrap"><div class="search">${icon('search', 18)}<input class="search-input" data-filter="list" placeholder="Search for a bank" data-guide="bank.search"></div></div>
      <p class="fine">Transfers are processed via InstaPay and are usually credited in real time. A ${fmt(BANK_FEE)} fee applies per transfer.</p>
      <p class="section-title pad">Popular banks</p>
      <div class="list filterable">${BANKS.filter(b => b.popular).map(bankRow).join('')}</div>
      <p class="section-title pad">All banks (A–Z)</p>
      <div class="list filterable">${BANKS.filter(b => !b.popular).map(bankRow).join('')}</div>
      <p class="empty-row" id="no-results" hidden>No banks match your search.</p>`;
  }
  function screenBankForm({ bank }) {
    const b = BANK_BY_ID[bank];
    if (!b) return redirect('bank');
    const d = S.draft.bank && S.draft.bank.bankId === b.id ? S.draft.bank : {};
    return `${appbar('Bank Transfer', 'bank')}
      <form data-form="bank" data-bank="${b.id}" novalidate>
        <div class="biller-head"><span class="avatar lg">${icon('landmark', 24)}</span><b>${esc(b.name)}</b></div>
        <div class="card">
          ${field({ name: 'accountName', label: 'Account name', value: d.accountName || '', placeholder: 'As shown on the bank account', guide: 'bank.account-name' })}
          ${field({ name: 'account', label: 'Account number', value: d.account || '', placeholder: `${b.lens.join(' or ')}-digit account number`, inputmode: 'numeric', maxlength: 20, guide: 'bank.account' })}
          ${field({ name: 'amount', label: 'Amount', value: d.amount ? d.amount.toFixed(2) : '', placeholder: '0.00', inputmode: 'decimal', prefix: '₱', guide: 'bank.amount', hint: `Fee: ${fmt(BANK_FEE)} · Limit: ${fmt(BANK_LIMIT)} per transaction` })}
        </div>
        <p class="fine">Make sure the account name and number are correct. Money sent to the wrong account may no longer be recovered.</p>
        <div class="footer"><button class="btn" type="submit" data-guide="bank.next">Next</button></div>
      </form>`;
  }
  function submitBank(form) {
    const b = BANK_BY_ID[form.dataset.bank];
    const v = formValues(form);
    const acct = String(v.account || '').replace(/[\s-]/g, '');
    const amount = parseAmount(v.amount);
    const errs = {};
    if (!String(v.accountName || '').trim()) errs.accountName = 'Please enter the account name.';
    else if (/\d/.test(v.accountName)) errs.accountName = 'Account name should not contain numbers.';
    if (!acct) errs.account = 'Please enter the account number.';
    else if (!/^\d+$/.test(acct)) errs.account = 'Invalid account number. It must contain numbers only.';
    else if (!b.lens.includes(acct.length)) errs.account = `Invalid account number. ${b.name} account numbers have ${b.lens.join(' or ')} digits.`;
    const ae = amountError(amount, { min: 1, max: BANK_LIMIT, fee: BANK_FEE });
    if (ae) errs.amount = ae;
    if (!showErrors(form, errs)) return;
    S.draft.bank = { bankId: b.id, accountName: v.accountName.trim().toUpperCase(), account: acct, amount };
    go('bank/review');
  }
  function screenBankReview() {
    const d = S.draft.bank;
    if (!d || !d.amount) return redirect('bank');
    const b = BANK_BY_ID[d.bankId];
    const rows = [['Bank', b.name], ['Account name', d.accountName], ['Account number', d.account], ['Amount', fmt(d.amount)], ['Transfer fee', fmt(BANK_FEE)], ['Channel', 'InstaPay']];
    return `${appbar('Review', `bank/form/${b.id}`)}
      ${reviewBlock(`You are transferring to ${b.name}`, d.amount, rows, d.amount + BANK_FEE)}
      <div class="footer">
        <button class="btn" data-action="confirm" data-kind="bank" data-guide="review.confirm">Confirm Transfer</button>
        <button class="btn ghost" data-action="nav" data-to="bank/form/${b.id}" data-guide="review.edit">Edit details</button>
      </div>`;
  }

  /* OTP / 2FA step */
  function newOtp() {
    S.otp = { code: String(Math.floor(100000 + Math.random() * 900000)), attempts: 0, sentAt: Date.now() };
    save();
  }
  function screenBankOtp() {
    const d = S.draft.bank;
    if (!d || !d.amount) return redirect('bank');
    if (!S.otp) newOtp();
    return {
      html: `${appbar('Verification', 'bank/review')}
        <div class="otp" data-guide="otp">
          <div class="otp-ic">${icon('lock', 30)}</div>
          <h2>Two-Factor Authentication (2FA)</h2>
          <p>Enter the 6-digit One-Time PIN (OTP) sent via SMS to your registered mobile number <b>+63 9** *** ${USER.mobile.slice(-4)}</b>. The OTP is valid for 5 minutes.</p>
          <form data-form="otp" novalidate>
            ${field({ name: 'otp', label: 'One-Time PIN', placeholder: '••••••', inputmode: 'numeric', maxlength: 6, guide: 'otp.input', autocomplete: 'one-time-code' })}
            <button class="btn" type="submit" data-guide="otp.submit">Verify</button>
          </form>
          <p class="resend" id="resend" data-guide="otp.resend"></p>
          <p class="fine">Never share your OTP with anyone. ${esc(BRAND.name)} will never ask for your OTP.</p>
        </div>`,
      after() {
        const code = S.otp.code;
        timers.push(setTimeout(() => toast(`<b>${esc(BRAND.name)}</b>: Your OTP is <b>${code}</b>. It expires in 5 minutes. Do NOT share this code with anyone.`, { sms: true, duration: 10000 }), 1500));
        const tick = () => {
          const el = $('#resend');
          if (!el || !S.otp) return true;
          const s = 30 - Math.floor((Date.now() - S.otp.sentAt) / 1000);
          if (s > 0) { el.innerHTML = `Didn't get the code? You can request a new one in <b>${s}s</b>.`; return false; }
          el.innerHTML = `Didn't get the code? <button class="link" data-action="otp-resend" data-guide="otp.resend-btn">Resend OTP</button>`;
          return true;
        };
        if (!tick()) { const id = setInterval(() => { if (tick()) clearInterval(id); }, 1000); timers.push(id); }
      },
    };
  }
  function submitOtp(form) {
    const code = digits(formValues(form).otp);
    if (code.length !== 6) return showErrors(form, { otp: 'Please enter the 6-digit OTP.' });
    if (!S.otp) { newOtp(); return render(); }
    if (code !== S.otp.code) {
      S.otp.attempts++;
      const left = 3 - S.otp.attempts;
      save();
      if (left <= 0) {
        S.otp = null;
        save();
        const msg = 'Too many invalid attempts. Your OTP has expired. Please review your transfer and request a new OTP.';
        emit('app:error', { screen: 'bank/otp', field: 'otp', message: msg });
        return dialog({ title: 'OTP expired', message: msg, ok: 'OK', name: 'otp-expired', onOk: () => go('bank/review') });
      }
      return showErrors(form, { otp: `Invalid OTP. You have ${left} remaining attempt${left === 1 ? '' : 's'}.` });
    }
    S.otp = null;
    const d = S.draft.bank, b = BANK_BY_ID[d.bankId];
    processTxn('bank', {
      title: `Transfer to ${b.name}`, sub: `${d.accountName} · ${d.account}`, total: d.amount + BANK_FEE,
      rows: [['Bank', b.name], ['Account name', d.accountName], ['Account number', d.account], ['Amount', fmt(d.amount)], ['Transfer fee', fmt(BANK_FEE)]],
    }, 'bank/review');
  }

  /* ---------- Result (success / failure) ---------- */
  const RESULT_TITLE = { send: 'Money sent!', load: 'Load purchased!', bill: 'Payment successful!', bank: 'Transfer successful!' };
  function screenResult() {
    const L = S.last;
    if (!L) return redirect('home');
    if (!L.ok) {
      return `<div class="result fail" data-guide="result.fail">
        <div class="result-icon">${icon('alert', 40)}</div>
        <h2>Transaction failed</h2>
        <p class="result-msg" data-guide="result.message">${esc(L.message)}</p>
        <p class="err-code" data-guide="result.code">Error code: ${esc(L.code)}</p>
        <p class="fine">Your balance was not deducted.</p>
        <div class="btn-col">
          <button class="btn" data-action="nav" data-to="${L.retry}" data-guide="result.retry">Try Again</button>
          <button class="btn ghost" data-action="nav" data-to="home" data-guide="result.home">Back to Home</button>
        </div></div>`;
    }
    const t = L.txn;
    return `<div class="result ok" data-guide="result.success">
      <div class="result-icon">${icon('check', 40)}</div>
      <h2>${RESULT_TITLE[t.kind] || 'Success!'}</h2>
      <p class="result-amt">${fmt(-t.amount)}</p>
      <div class="card receipt" data-guide="result.receipt">
        ${t.rows.map(([k, v]) => kv(k, v)).join('')}
        ${kv('Total', fmt(-t.amount))}
        ${kv('Reference no.', t.ref)}
        ${kv('Date', fmtDate(t.date))}
      </div>
      <p class="fine">New balance: <b>${fmt(S.balance)}</b></p>
      <div class="btn-col">
        <button class="btn" data-action="nav" data-to="home" data-guide="result.done">Done</button>
        <button class="btn ghost" data-action="save-receipt" data-guide="result.save">Save receipt</button>
      </div></div>`;
  }

  /* =======================================================================
     ACTIONS & EVENTS
     ======================================================================= */
  function confirm(kind) {
    const d = S.draft[kind];
    if (!d) return go('home');
    if (kind === 'send') {
      askMpin(() => processTxn('send', {
        title: `Sent to ${d.name}`, sub: fmtMobile(d.mobile), total: d.amount,
        rows: [['Sent to', d.name], ['Mobile number', fmtMobile(d.mobile)], ['Amount', fmt(d.amount)], ...(d.message ? [['Message', d.message]] : [])],
      }, 'send/review'));
    } else if (kind === 'load') {
      askMpin(() => processTxn('load', {
        title: `Buy Load: ${d.promo.name}`, sub: `${fmtMobile(d.mobile)} · ${d.network}`, total: d.amount,
        rows: [['Mobile number', fmtMobile(d.mobile)], ['Network', d.network], ['Load', d.promo.name]],
      }, 'load/review'));
    } else if (kind === 'bill') {
      const b = BILLER_BY_ID[d.billerId];
      askMpin(() => {
        if (d.save && !S.savedBillers.some(s => s.billerId === d.billerId && s.account === d.account)) {
          S.savedBillers.push({ billerId: d.billerId, account: d.account, accountName: d.accountName });
        }
        processTxn('bill', {
          title: `Paid ${b.name}`, sub: `${b.short || 'Acct'} ${d.account}`, total: d.amount + d.fee,
          rows: [['Biller', b.name], [b.field, d.account], ['Account name', d.accountName], ['Amount', fmt(d.amount)], ['Convenience fee', d.fee ? fmt(d.fee) : 'Free']],
        }, 'bills/review');
      });
    } else if (kind === 'bank') {
      newOtp();
      go('bank/otp');
    }
  }

  const ACTIONS = {
    nav: el => go(el.dataset.to),
    soon: el => (S.loggedIn ? go('soon/' + encodeURIComponent(el.dataset.name)) : soon(el.dataset.name)),
    backdrop: (el, e) => { if (e.target === el) closeModal(); },
    'modal-close': () => closeModal(),
    'dialog-ok': () => { const cb = dialogCb; dialogCb = null; closeModal(); if (cb) cb(); },
    'pin-key': el => pinKey(el.dataset.key),
    'pin-del': () => pinDel(),
    'toggle-focus': () => { S.focusMode = !S.focusMode; save(); applyFocus(); emit('app:focus', { on: S.focusMode }); },
    'toggle-balance': () => { S.hideBalance = !S.hideBalance; render(); },
    confirm: el => confirm(el.dataset.kind),
    'send-to': el => { S.draft.send = { mobile: el.dataset.mobile }; go('send/form'); },
    'pick-contact': el => {
      openModal(`<div class="sheet" data-guide="contacts.sheet">
        <div class="sheet-head"><h2>Choose a contact</h2><button class="icon-btn" data-action="modal-close" aria-label="Close" data-guide="contacts.close">${icon('x')}</button></div>
        <div class="list flush">${CONTACTS.map(c => `<button class="list-item" data-action="contact-choose" data-target="${el.dataset.target}" data-mobile="${c.mobile}" data-guide="contacts.item">
          <span class="avatar">${initials(c.name)}</span><span class="li-main"><span class="li-title">${esc(c.name)}</span><span class="li-sub">${fmtMobile(c.mobile)}</span></span></button>`).join('')}</div>
      </div>`, { name: 'contacts' });
    },
    'contact-choose': el => {
      const inp = $('#f-' + el.dataset.target);
      closeModal();
      if (inp) { inp.value = fmtMobile(el.dataset.mobile); inp.dispatchEvent(new Event('input', { bubbles: true })); }
    },
    'load-self': () => { const inp = $('#f-mobile'); if (inp) { inp.value = fmtMobile(USER.mobile); inp.dispatchEvent(new Event('input', { bubbles: true })); } },
    'load-tab': el => { if (S.draft.load) { S.draft.load.tab = el.dataset.tab; render(); } },
    'load-pick': el => {
      if (el.dataset.promo) {
        const p = [...LOAD_PROMOS.data, ...LOAD_PROMOS.call].find(p => p.id === el.dataset.promo);
        pickLoad(null, p);
      } else pickLoad(Number(el.dataset.amount));
    },
    'saved-biller': el => {
      const sb = S.savedBillers[Number(el.dataset.index)];
      if (!sb) return;
      S.draft.bill = { billerId: sb.billerId, account: sb.account, accountName: sb.accountName };
      go('bills/biller/' + sb.billerId);
    },
    'otp-resend': () => { newOtp(); render(); toast('A new OTP has been sent.'); },
    'txn-open': el => {
      const t = S.txns.find(t => t.id === el.dataset.id);
      if (!t) return;
      openModal(`<div class="sheet" data-guide="receipt.sheet">
        <div class="sheet-head"><h2>Transaction details</h2><button class="icon-btn" data-action="modal-close" aria-label="Close" data-guide="receipt.close">${icon('x')}</button></div>
        <p class="sheet-amt ${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+' : '-'}${fmt(Math.abs(t.amount))}</p>
        <div class="receipt">${kv('Description', t.title)}${kv('Details', t.sub)}${t.rows.map(([k, v]) => kv(k, v)).join('')}${kv('Reference no.', t.ref)}${kv('Date', fmtDate(t.date))}</div>
      </div>`, { name: 'receipt' });
    },
    'msg-open': el => {
      const m = INBOX.find(m => m.id === el.dataset.id);
      if (!m) return;
      m.unread = false;
      openModal(`<div class="sheet" data-guide="message.sheet">
        <div class="sheet-head"><h2>${esc(m.title)}</h2><button class="icon-btn" data-action="modal-close" aria-label="Close" data-guide="message.close">${icon('x')}</button></div>
        <p class="sheet-body">${esc(m.body)}</p><p class="fine">${esc(m.time)}</p></div>`, { name: 'message' });
    },
    logout: () => dialog({
      title: 'Log out?', message: 'You will need to enter your MPIN again to log in.', ok: 'Log Out', cancel: 'Cancel', danger: true, name: 'logout',
      onOk: () => { S.loggedIn = false; S.draft = {}; S.last = null; S.otp = null; save(); go('login'); },
    }),
    'save-receipt': () => toast('Receipt saved to your Gallery.'),
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || !device.contains(el)) return;
    const fn = ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });

  const FORMS = { send: submitSend, load: submitLoad, bill: submitBill, bank: submitBank, otp: submitOtp,
    'load-custom': form => {
      const amount = parseAmount(formValues(form).amount);
      let err = null;
      if (Number.isNaN(amount)) err = 'Please enter an amount.';
      else if (amount < 10 || amount > 1000) err = 'Regular load amount must be between ₱10 and ₱1,000.';
      else if (!Number.isInteger(amount)) err = 'Please enter a whole peso amount (no centavos).';
      if (!showErrors(form, err ? { amount: err } : {})) return;
      pickLoad(amount);
    },
  };
  document.addEventListener('submit', e => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const fn = FORMS[form.dataset.form];
    if (fn) fn(form);
  });

  document.addEventListener('input', e => {
    const t = e.target;
    const f = t.closest('.field.invalid');
    if (f) f.classList.remove('invalid');
    if (t.id === 'biller-search') return searchBillers(t.value);
    if (t.dataset.filter === 'list' || t.id === 'svc-search') {
      const q = t.value.trim().toLowerCase();
      let shown = 0;
      $$('[data-search]', screenEl).forEach(item => {
        const hit = !q || item.dataset.search.includes(q);
        item.hidden = !hit;
        if (hit) shown++;
      });
      const nr = $('#no-results');
      if (nr) nr.hidden = shown > 0;
      return;
    }
    const form = t.closest('form[data-form]');
    if (form && form.dataset.form === 'load' && t.name === 'mobile') updateNetDetect(t.value);
  });

  /* Physical keyboard for MPIN (handy when demoing on a laptop) */
  document.addEventListener('keydown', e => {
    if (!pin.ctx || !$('#pin-dots') || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (/^[0-9]$/.test(e.key)) pinKey(e.key);
    else if (e.key === 'Backspace') pinDel();
    else if (e.key === 'Escape' && modalName) closeModal();
  });

  /* Status bar clock */
  function tickClock() {
    const el = $('#sb-time');
    if (el) el.textContent = new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, '');
  }
  tickClock();
  setInterval(tickClock, 30000);

  window.addEventListener('hashchange', render);

  /* ---------------- public API for the overlay team ---------------- */
  window.App = {
    go,
    render,
    device,
    get screen() { return screenEl.dataset.screen; },
    get state() { return JSON.parse(JSON.stringify(S)); },
    get modal() { return modalName; },
    failNext() { S.failNext = true; save(); return 'The next transaction will fail.'; },
    reset() { try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } S = freshState(); go('login'); },
  };

  render();
})();
