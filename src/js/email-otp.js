import { getOrderApiUrl } from './order-api.js';

function otpBaseUrl() {
  const orderUrl = getOrderApiUrl();
  if (!orderUrl) return '';
  return orderUrl.replace(/\/order\/?$/, '');
}

export function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function sendEmailOtp(email) {
  const base = otpBaseUrl();
  if (!base) throw Object.assign(new Error('API не настроен'), { error: 'no_api' });

  const res = await fetch(`${base}/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalizeEmail(email) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || 'Не удалось отправить код');
    err.status = res.status;
    err.error = data.error || '';
    throw err;
  }
  return data;
}

export async function verifyEmailOtp(email, code) {
  const base = otpBaseUrl();
  if (!base) throw Object.assign(new Error('API не настроен'), { error: 'no_api' });

  const res = await fetch(`${base}/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalizeEmail(email), code: String(code || '').trim() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || 'Неверный код');
    err.status = res.status;
    err.error = data.error || '';
    throw err;
  }
  return data;
}
