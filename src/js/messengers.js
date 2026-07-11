import { getShopInfo } from './data.js';

export const MESSENGER_ICONS = {
  whatsapp: `<svg viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.884 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,

  telegram: `<svg viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,

  max: `<svg viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="maxGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#5B4FE9"/><stop offset="50%" stop-color="#7B61FF"/><stop offset="100%" stop-color="#A855F7"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#maxGrad)"/><path fill="#fff" d="M6.5 16V8h2.1l2.4 4.8L13.4 8H15.5v8h-1.8v-4.9L11 16H9.9l-2.7-4.9V16H6.5zm8.2 0V8h3.2c1.5 0 2.5.9 2.5 2.2 0 .9-.5 1.6-1.3 1.9 1 .3 1.6 1 1.6 2.1 0 1.4-1.1 2.3-2.8 2.3H14.7zm1.8-4.6h1.2c.6 0 .9-.3.9-.7s-.3-.7-.9-.7h-1.2v1.4zm0 3.2h1.3c.7 0 1.1-.3 1.1-.8 0-.5-.4-.8-1.1-.8h-1.3v1.6z"/></svg>`,
};

function normalizePhone(phone) {
  return phone.replace(/\D/g, '');
}

function normalizeUsername(username) {
  return username.replace(/^@/, '');
}

/**
 * Ссылки для отправки заказа в мессенджеры
 */
export function getMessengerLinks(message) {
  const shop = getShopInfo();
  const messengers = shop.messengers || {};
  const encoded = encodeURIComponent(message);
  const links = {};

  if (messengers.whatsapp?.phone) {
    const phone = normalizePhone(messengers.whatsapp.phone);
    links.whatsapp = {
      id: 'whatsapp',
      label: messengers.whatsapp.label || 'WhatsApp',
      url: `https://wa.me/${phone}?text=${encoded}`,
      hint: 'Откроется чат с нами',
    };
  }

  if (messengers.telegram?.username) {
    const user = normalizeUsername(messengers.telegram.username);
    links.telegram = {
      id: 'telegram',
      label: messengers.telegram.label || 'Telegram',
      url: `https://t.me/${user}?text=${encoded}`,
      hint: `@${user}`,
    };
  }

  if (messengers.max) {
    const max = messengers.max;
    if (max.botUsername) {
      const bot = normalizeUsername(max.botUsername);
      links.max = {
        id: 'max',
        label: max.label || 'MAX',
        url: `https://max.ru/${bot}?start=order`,
        hint: 'Откроется наш бот в MAX',
      };
    } else if (max.username) {
      const user = normalizeUsername(max.username);
      links.max = {
        id: 'max',
        label: max.label || 'MAX',
        url: `https://max.ru/${user}?text=${encoded}`,
        hint: `@${user}`,
      };
    } else {
      links.max = {
        id: 'max',
        label: max.label || 'MAX',
        url: `https://max.ru/:share?text=${encoded}`,
        hint: 'Выберите наш чат в MAX',
      };
    }
  }

  return links;
}

export function getMessengerList(message) {
  const links = getMessengerLinks(message);
  return ['whatsapp', 'telegram', 'max']
    .filter((id) => links[id])
    .map((id) => links[id]);
}
