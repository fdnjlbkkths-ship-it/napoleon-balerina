/**
 * Production SBP (Система быстрых платежей) for self-employed checkout.
 *
 * BLOCKER / TODO: set `link` to the real bank or «Мой налог» SBP payment URL.
 * Until then the pay button opens a placeholder. One-line change goes live after rebuild.
 *
 * Example:
 *   link: 'https://qr.nspk.ru/XXXX...'
 *   // or the payment page URL from your bank / Мой налог
 */
export const SBP_PAYMENT = {
  /** Временно отключено — включите true и подставьте link, когда будет ссылка СБП */
  enabled: false,
  /** Real SBP deep-link or payment page URL — replace before customers can pay */
  link: 'https://example.com/sbp-placeholder',
  buttonLabel: 'Оплатить через СБП',
  qrNote:
    'Откройте ссылку в банковском приложении или отсканируйте QR СБП из «Мой налог» / банка.',
  confirmHint:
    'После оплаты напишите нам — подтвердим поступление. Чек сформируется в «Мой налог».',
  paymentLine: 'Оплата: ожидает (СБП)',
  paymentLineDisabled: 'Оплата: уточнит менеджер',
};

export function isSbpEnabled() {
  return Boolean(SBP_PAYMENT.enabled);
}

export function getPaymentStatusLine() {
  return isSbpEnabled() ? SBP_PAYMENT.paymentLine : SBP_PAYMENT.paymentLineDisabled;
}

/** @returns {boolean} true when SBP is enabled and `link` looks like a real URL */
export function isSbpLinkConfigured() {
  if (!isSbpEnabled()) return false;
  const link = String(SBP_PAYMENT.link || '').trim();
  if (!link || link === '#' || link.startsWith('javascript:')) return false;
  try {
    const host = new URL(link).hostname;
    return Boolean(host) && host !== 'example.com' && !host.endsWith('.example');
  } catch {
    return false;
  }
}
