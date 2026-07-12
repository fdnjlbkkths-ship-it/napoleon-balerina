/**
 * Согласие на cookies / аналитику (GDPR-style).
 * Без согласия аналитика не запускается.
 */

const STORAGE_KEY = 'nb-consent-v1';
const CONSENT_VERSION = 1;
const CONSENT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 180; // 6 месяцев

export function getConsent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== CONSENT_VERSION) return null;
    if (Date.now() - Number(data.updatedAt || 0) > CONSENT_MAX_AGE_MS) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent() {
  return getConsent()?.analytics === true;
}

export function saveConsent({ analytics }) {
  const data = {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: Boolean(analytics),
    updatedAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('consent-changed', { detail: data }));
  return data;
}

export function clearConsent() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('consent-changed', { detail: null }));
}

function hideBanner(el) {
  if (!el) return;
  el.classList.remove('is-visible');
  el.setAttribute('aria-hidden', 'true');
  setTimeout(() => el.remove(), 320);
}

function buildBanner() {
  const root = document.createElement('div');
  root.id = 'consent-banner';
  root.className = 'consent-banner';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  root.setAttribute('aria-labelledby', 'consent-banner-title');
  root.setAttribute('aria-hidden', 'true');

  root.innerHTML = `
    <div class="consent-banner__panel">
      <div class="consent-banner__copy">
        <p class="consent-banner__title" id="consent-banner-title">Файлы cookie и статистика</p>
        <p class="consent-banner__text">
          Мы используем обязательные cookie для работы сайта (корзина) и — только с вашего согласия —
          обезличенную статистику посещений (страница, источник перехода, устройство).
          Это помогает понимать, какие разделы интересны гостям.
          Подробнее — в
          <a href="privacy.html">политике конфиденциальности</a>.
        </p>
      </div>
      <div class="consent-banner__actions">
        <button type="button" class="btn btn--ghost consent-banner__btn consent-banner__btn--reject" data-consent="reject">
          Только необходимые
        </button>
        <button type="button" class="btn btn--primary consent-banner__btn" data-consent="accept">
          Принять всё
        </button>
      </div>
      <button type="button" class="consent-banner__settings" data-consent="open-settings">
        Настроить
      </button>
    </div>
  `;

  return root;
}

function buildSettingsModal() {
  const root = document.createElement('div');
  root.id = 'consent-settings';
  root.className = 'consent-settings';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'consent-settings-title');
  root.hidden = true;

  const current = getConsent();
  const analyticsOn = current ? current.analytics : false;

  root.innerHTML = `
    <div class="consent-settings__backdrop" data-consent-close></div>
    <div class="consent-settings__panel">
      <h2 class="consent-settings__title" id="consent-settings-title">Настройки конфиденциальности</h2>
      <p class="consent-settings__lead">
        Вы можете в любой момент изменить решение. Отзыв согласия останавливает сбор статистики на этом устройстве.
      </p>

      <label class="consent-switch">
        <span class="consent-switch__text">
          <strong>Необходимые</strong>
          <small>Корзина и базовые настройки сайта. Всегда включены.</small>
        </span>
        <input type="checkbox" checked disabled>
      </label>

      <label class="consent-switch">
        <span class="consent-switch__text">
          <strong>Аналитика посещений</strong>
          <small>Обезличенные просмотры страниц для улучшения меню и сервиса.</small>
        </span>
        <input type="checkbox" id="consent-analytics-toggle" ${analyticsOn ? 'checked' : ''}>
      </label>

      <div class="consent-settings__actions">
        <button type="button" class="btn btn--ghost" data-consent-close>Отмена</button>
        <button type="button" class="btn btn--primary" data-consent-save>Сохранить</button>
      </div>
    </div>
  `;

  return root;
}

export function openConsentSettings() {
  let modal = document.getElementById('consent-settings');
  if (!modal) {
    modal = buildSettingsModal();
    document.body.appendChild(modal);
    wireSettings(modal);
  } else {
    const toggle = modal.querySelector('#consent-analytics-toggle');
    if (toggle) toggle.checked = hasAnalyticsConsent();
  }
  modal.hidden = false;
}

function wireSettings(modal) {
  modal.querySelectorAll('[data-consent-close]').forEach((el) => {
    el.addEventListener('click', () => {
      modal.hidden = true;
    });
  });

  modal.querySelector('[data-consent-save]')?.addEventListener('click', () => {
    const analytics = Boolean(modal.querySelector('#consent-analytics-toggle')?.checked);
    saveConsent({ analytics });
    modal.hidden = true;
    hideBanner(document.getElementById('consent-banner'));
  });
}

export function initConsent() {
  // Ссылка в футере / повторное открытие настроек
  document.querySelectorAll('[data-open-consent]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openConsentSettings();
    });
  });

  if (getConsent()) return;

  const banner = buildBanner();
  document.body.appendChild(banner);
  requestAnimationFrame(() => {
    banner.classList.add('is-visible');
    banner.setAttribute('aria-hidden', 'false');
  });

  banner.querySelector('[data-consent="accept"]')?.addEventListener('click', () => {
    saveConsent({ analytics: true });
    hideBanner(banner);
  });

  banner.querySelector('[data-consent="reject"]')?.addEventListener('click', () => {
    saveConsent({ analytics: false });
    hideBanner(banner);
  });

  banner.querySelector('[data-consent="open-settings"]')?.addEventListener('click', () => {
    openConsentSettings();
  });
}
