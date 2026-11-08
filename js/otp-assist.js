/* =========================================================================
   OTP autofill overlay — "Fill in the code for me".

   A separate layer on top of #device (it doesn't change how the app works).
   While Focus mode is on and the user is on a 2FA screen (any route ending in /otp),
   it listens for the app's fake text message (app:toast with sms: true),
   reads the 6-digit code from it, and shows a bar at the bottom of the phone:
   "Code from your text message: 123 456  [Fill in code]". Tapping the button
   types the code into the OTP field; the user still taps Verify themselves.

   Hooks used: app:screen, app:toast, app:focus events; .focus-on on #device;
   the [data-guide="otp.input"] field.
   Fires: window 'overlay:otp-fill' { route } when the code is filled in.
   ========================================================================= */
(() => {
  const device = document.getElementById('device');
  if (!device) return;

  const bar = document.createElement('div');
  bar.id = 'otp-assist';
  bar.dataset.guide = 'otp-assist';
  bar.hidden = true;
  bar.setAttribute('role', 'status');
  device.appendChild(bar);

  let code = null;      // latest code from the text message, for this OTP screen
  let route = null;     // current route pattern
  let filled = false;
  let hideTimer = 0;

  const onOtpScreen = () => !!route && /\/otp$/.test(route);
  const active = () => device.classList.contains('focus-on') && onOtpScreen() && !!code;
  const spaced = c => `${c.slice(0, 3)} ${c.slice(3)}`;

  function draw() {
    if (!active()) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = filled
      ? `<div class="oa-text"><p class="oa-kicker">Done</p><p class="oa-main">Code filled in. Now tap <b>Verify</b>.</p></div>`
      : `<div class="oa-text">
           <p class="oa-kicker">From your text messages</p>
           <p class="oa-main">Your code: <b class="oa-code">${spaced(code)}</b></p>
         </div>
         <button type="button" class="oa-fill" data-guide="otp-assist.fill">Fill in code</button>`;
  }

  function fill() {
    const input = document.querySelector('[data-guide="otp.input"]');
    if (!input || !code) return;
    input.value = code;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    filled = true;
    draw();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { code = null; draw(); }, 4000);
    const verify = document.querySelector('[data-guide="otp.submit"]');
    if (verify) verify.focus({ preventScroll: true });
    window.dispatchEvent(new CustomEvent('overlay:otp-fill', { detail: { route } }));
  }

  bar.addEventListener('click', e => {
    if (e.target.closest('.oa-fill')) { e.stopPropagation(); fill(); }
  });

  window.addEventListener('app:screen', e => {
    route = e.detail && e.detail.route;
    code = null;          // every OTP screen (and every resend) waits for its own message
    filled = false;
    clearTimeout(hideTimer);
    draw();
  });
  window.addEventListener('app:toast', e => {
    const d = e.detail || {};
    if (!d.sms || !onOtpScreen()) return;
    const m = /\b(\d{6})\b/.exec(d.text || '');
    if (!m) return;
    code = m[1];
    filled = false;
    clearTimeout(hideTimer);
    draw();
  });
  window.addEventListener('app:focus', draw);

  if (window.App && App.screen) route = App.screen;
})();
