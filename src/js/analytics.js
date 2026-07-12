/**
 * Обезличенная аналитика посещений — только при согласии.
 */

import { getOrderApiUrl } from './order-api.js';
import { hasAnalyticsConsent } from './consent.js';

const SESSION_KEY = 'nb-analytics-session';

function analyticsEndpoint() {
  const orderUrl = getOrderApiUrl();
  if (!orderUrl) return '';
  return orderUrl.replace(/\/order\/?$/, '/analytics');
}

function sessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

function pagePath() {
  const path = window.location.pathname || '/';
  const file = path.split('/').pop() || 'index.html';
  return file.includes('.') ? file : 'index.html';
}

export async function trackPageView() {
  if (!hasAnalyticsConsent()) return;
  const url = analyticsEndpoint();
  if (!url) return;

  const payload = {
    path: pagePath(),
    referrer: document.referrer ? (() => {
      try {
        return new URL(document.referrer).hostname || 'direct';
      } catch {
        return 'direct';
      }
    })() : 'direct',
    title: document.title.slice(0, 120),
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    language: (navigator.language || '').slice(0, 16),
    sessionId: sessionId(),
    ts: Date.now(),
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      mode: 'cors',
    });
  } catch (err) {
    console.warn('analytics', err);
  }
}

export function initAnalytics() {
  const run = () => {
    if (hasAnalyticsConsent()) trackPageView();
  };

  run();
  window.addEventListener('consent-changed', (e) => {
    if (e.detail?.analytics) trackPageView();
  });
}
