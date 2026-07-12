import { getShopInfo } from './data.js';

export const LEGAL_PLACEHOLDERS = {
  sellerName: '[Укажите ФИО продавца в products.json → shop.sellerName]',
  sellerInn: '[Укажите ИНН в products.json → shop.sellerInn]',
};

/** Подставляет реквизиты продавца и плейсхолдеры на юридических страницах. */
export function initLegalContent() {
  const shop = getShopInfo() || {};

  const values = {
    sellerName: shop.sellerName?.trim() || LEGAL_PLACEHOLDERS.sellerName,
    sellerInn: shop.sellerInn?.trim() || LEGAL_PLACEHOLDERS.sellerInn,
    sellerStatus: 'Плательщик налога на профессиональный доход (самозанятый)',
    sellerCity: shop.city || 'Чебоксары',
    sellerAddress: shop.addressFull || shop.address || 'Лесная улица, 7',
    sellerPhone: shop.phone || '',
    sellerEmail: shop.email || '',
    sellerHours: shop.hours || 'Пн–Вс: 9:00 – 21:00',
    shopName: shop.name || 'Наполеон и Балерина',
  };

  document.querySelectorAll('[data-legal]').forEach((el) => {
    const key = el.getAttribute('data-legal');
    const value = values[key];
    if (value == null || value === '') return;

    if (key === 'sellerPhone' && el.tagName === 'A') {
      el.textContent = value;
      el.href = `tel:${String(value).replace(/\D/g, '')}`;
      return;
    }
    if (key === 'sellerEmail' && el.tagName === 'A') {
      el.textContent = value;
      el.href = `mailto:${value}`;
      return;
    }

    el.textContent = value;
  });
}
