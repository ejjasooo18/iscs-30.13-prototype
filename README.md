# ISCS 30.17 Prototype — E-Wallet Replica + Assistive Overlay

Facunda-Sy, Jaso, Mercado · ISCS 30.17-DM

This repo holds the **target app**: a GCash-style e-wallet replica, kept deliberately
crowded and full of jargon. The **assistive overlay** (blur/fade + highlight/translate)
is built on top of it.

- Plain HTML/CSS/JS. No build step, no dependencies.
- Open `index.html` directly, or deploy the folder as a static site (GitHub Pages, Vercel, Netlify).
- On a laptop it shows inside a phone frame. On a real phone it fills the screen.
- **Demo MPIN: `1234`**
- The app's name is fictional (`BRAND.name` in [js/data.js](js/data.js)).
  We don't use the real GCash name or logo because a public page that copies a bank-like
  app with an MPIN screen can get flagged as phishing.

## Flows

| Flow | Path | Error cases you can trigger |
|---|---|---|
| Login | MPIN keypad | wrong MPIN (shows attempts left), locked for 30s after 3 wrong tries |
| Send Money | Home → Send → Express Send → form → review → MPIN → result | empty fields, invalid number, own number, unregistered number (any number ending in `0000`), amount over limit, not enough balance |
| Buy Load | Home → Load → number → Regular / Data / Call & Text → review → MPIN → result | invalid number, unknown network (e.g. `0900…`) means you must pick one, not enough balance |
| Pay Bills | Home → Bills → search or category → biller → form → review → MPIN → result | wrong account-number length (e.g. Meralco CAN = 10 digits), missing name, bad email, biller search with no results |
| Bank Transfer | Home → Transfer → bank → form → review → **OTP (2FA)** → result | wrong account-number length, ₱15 fee counted against balance, wrong OTP (3 tries), resend OTP after 30s |
| Any transaction | — | run `App.failNext()` in the console (or open `index.html?fail`) and the next transaction fails with `TXN-5003` |

Things added to make the app feel realistic: a promo popup on login, a 16-icon service grid,
banners, a nested "View All" menu, and "not available in this prototype" pages for
features we didn't build.

State is kept in `sessionStorage`, so a refresh keeps you logged in. `App.reset()` starts over.

## Hooking in the overlay (Nathan & Ian)

### 1. Where to mount it
Add your layer **inside `#device`** (it's `position: relative`). Use
`position:absolute; inset:0; z-index:100+; pointer-events:none`, and turn `pointer-events`
back on only for your own controls. Modals sit at z-index 50 and toasts at 60.
`App.device` gives you the element.

### 2. Stable selectors: `data-guide`
Every element that matters has a `data-guide` attribute. Select it with
`document.querySelector('[data-guide="home.svc-bills"]')`.

| Screen | Key `data-guide` values |
|---|---|
| Home | `home.svc-send`, `home.svc-load`, `home.svc-transfer`, `home.svc-bills`, `home.svc-all`, `home.balance`, `home.cashin`, `home.notifications`, `home.banners`, `popup.ad`, `popup.close`, `popup.cta` |
| Bottom tabs | `tab.home`, `tab.inbox`, `tab.qr`, `tab.transactions`, `tab.profile` |
| Any page | `nav.back` |
| Send | `send.express`, `send.bank`, `send.recent`, `send.mobile`, `send.amount`, `send.message`, `send.next`, `contacts.open`, `contacts.item` |
| Load | `load.mobile`, `load.self`, `load.network`, `load.next`, `load.tab-regular` / `-data` / `-call`, `load.amount-50`, `load.promo-d99`, `load.custom-amount` |
| Bills | `bills.search`, `bills.cat-electric` (…`water`, `internet`, `telecom`, `gov`, `insurance`, `cards`, `schools`), `bills.biller-meralco`, `bills.saved-meralco`, `bill.account`, `bill.account-name`, `bill.amount`, `bill.email`, `bill.next` |
| Bank | `bank.search`, `bank.bank-bpi`, `bank.account-name`, `bank.account`, `bank.amount`, `bank.next` |
| Review | `review.amount`, `review.details`, `review.warning`, `review.confirm`, `review.edit` |
| MPIN | `mpin.sheet`, `mpin.keypad`, `mpin.message`, `mpin.close`, `login.keypad`, `login.message` |
| OTP | `otp.input`, `otp.submit`, `otp.resend`, `toast.sms` |
| Result | `result.success`, `result.fail`, `result.message`, `result.code`, `result.retry`, `result.done` |
| Field errors | `<input guide>.error`, e.g. `send.mobile.error`, `bill.account.error` |

To list every one on the current screen:
`[...document.querySelectorAll('[data-guide]')].map(e => e.dataset.guide)`

### 3. Events (listen on `window`)
```js
window.addEventListener('app:screen', e => e.detail);      // { route: 'send/form', path, params } after each render
window.addEventListener('app:modal', e => e.detail);       // { name: 'promo'|'mpin'|'contacts'|'loading'|..., open: true|false }
window.addEventListener('app:error', e => e.detail);       // { screen, field, message, code? } for every error shown
window.addEventListener('app:toast', e => e.detail);       // { text, sms } e.g. the OTP SMS
window.addEventListener('app:transaction', e => e.detail); // { ok, kind: 'send'|'load'|'bill'|'bank', txn? }
```
`app:error` is the hook for **translating jargon**. It gives you the exact text of each error
(e.g. *"Invalid CAN. It must be exactly 10 digits"*), so you can show a plain-language version.

### 4. `window.App`
`App.screen` (current route), `App.modal`, `App.state` (read-only copy), `App.go('bills')`,
`App.failNext()`, `App.reset()`, `App.device`.

## Files
- [index.html](index.html): phone shell, bottom nav, modal/toast roots
- [css/styles.css](css/styles.css): styles (small text and dense layout on purpose)
- [js/data.js](js/data.js): mock data (user, contacts, billers, banks, promos, brand name)
- [js/icons.js](js/icons.js): inline SVG icons
- [js/app.js](js/app.js): router, screens, validation, events
- `prev-outputs/`: Empathize / Ideate reports and prototype meeting notes
