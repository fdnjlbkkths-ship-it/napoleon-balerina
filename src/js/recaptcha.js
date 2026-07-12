/**
 * Google reCAPTCHA: v3 (невидимый score) + v2 (картинки) по требованию сервера.
 */

const V3_SITE_KEY = String(import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY || '').trim();
const V2_SITE_KEY = String(import.meta.env.VITE_RECAPTCHA_V2_SITE_KEY || '').trim();

let v3Ready = null;
let v2WidgetId = null;
let interaction = {
  startedAt: 0,
  moves: 0,
  keys: 0,
  touches: 0,
};

export function isRecaptchaConfigured() {
  return Boolean(V3_SITE_KEY);
}

export function isRecaptchaV2Configured() {
  return Boolean(V2_SITE_KEY);
}

export function beginCheckoutSession() {
  interaction = {
    startedAt: Date.now(),
    moves: 0,
    keys: 0,
    touches: 0,
  };

  const bumpMove = () => {
    interaction.moves += 1;
  };
  const bumpKey = () => {
    interaction.keys += 1;
  };
  const bumpTouch = () => {
    interaction.touches += 1;
  };

  // once per checkout open — listeners on document while cart open is fine
  document.addEventListener('mousemove', bumpMove, { passive: true });
  document.addEventListener('keydown', bumpKey, { passive: true });
  document.addEventListener('touchstart', bumpTouch, { passive: true });

  interaction._cleanup = () => {
    document.removeEventListener('mousemove', bumpMove);
    document.removeEventListener('keydown', bumpKey);
    document.removeEventListener('touchstart', bumpTouch);
  };
}

export function endCheckoutSession() {
  interaction._cleanup?.();
  interaction._cleanup = null;
}

export function getAntiBotSignals() {
  const honeypot =
    document.querySelector('[data-antibot-honeypot]')?.value?.trim() || '';

  return {
    startedAt: interaction.startedAt || Date.now(),
    gestureScore: Math.min(
      100,
      interaction.moves + interaction.keys * 3 + interaction.touches * 5
    ),
    hasGestures:
      interaction.moves > 0 || interaction.keys > 0 || interaction.touches > 0,
    honeypot,
    elapsedMs: Date.now() - (interaction.startedAt || Date.now()),
  };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (window.grecaptcha) resolve();
      else existing.addEventListener('load', () => resolve());
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Не удалось загрузить reCAPTCHA'));
    document.head.appendChild(s);
  });
}

export async function ensureRecaptchaV3() {
  if (!V3_SITE_KEY) return false;
  if (!v3Ready) {
    v3Ready = loadScript(
      `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(V3_SITE_KEY)}`
    ).then(
      () =>
        new Promise((resolve) => {
          window.grecaptcha.ready(() => resolve(true));
        })
    );
  }
  await v3Ready;
  return true;
}

export async function getRecaptchaV3Token(action = 'order') {
  if (!(await ensureRecaptchaV3())) return '';
  return window.grecaptcha.execute(V3_SITE_KEY, { action });
}

export async function mountRecaptchaV2(container) {
  if (!V2_SITE_KEY || !container) return null;

  await loadScript('https://www.google.com/recaptcha/api.js?render=explicit');
  await new Promise((resolve) => {
    window.grecaptcha.ready(() => resolve());
  });

  container.innerHTML = '';
  container.hidden = false;

  return new Promise((resolve) => {
    v2WidgetId = window.grecaptcha.render(container, {
      sitekey: V2_SITE_KEY,
      theme: 'light',
      size: 'normal',
      callback: (token) => resolve(token),
      'expired-callback': () => resolve(''),
      'error-callback': () => resolve(''),
    });
  });
}

export function getRecaptchaV2Response() {
  if (v2WidgetId == null || !window.grecaptcha) return '';
  try {
    return window.grecaptcha.getResponse(v2WidgetId) || '';
  } catch {
    return '';
  }
}

export function resetRecaptchaV2() {
  if (v2WidgetId == null || !window.grecaptcha) return;
  try {
    window.grecaptcha.reset(v2WidgetId);
  } catch {
    /* ignore */
  }
}

export function hideRecaptchaV2(container) {
  if (container) {
    container.hidden = true;
    container.innerHTML = '';
  }
  v2WidgetId = null;
}
