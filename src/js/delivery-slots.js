/** Готовка позиции — 12 часов. Магазин: 9:00–21:00. */

export const PREP_HOURS = 12;
export const SHOP_OPEN_HOUR = 9;
export const SHOP_CLOSE_HOUR = 21;
export const SLOT_MINUTES = 30;

function pad(n) {
  return String(n).padStart(2, '0');
}

export function toIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toTimeValue(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseIsoDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function formatDisplayDate(iso) {
  if (!iso) return '';
  const date = parseIsoDate(iso);
  return date.toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}

function atHour(base, hour, minute = 0) {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Начало готовки:
 * — если now + 12ч успевает до закрытия сегодня (≤ 21:00) → готовка с текущего момента
 * — иначе → с открытия магазина следующего дня (9:00)
 */
export function getCookingStart(now = new Date()) {
  const todayClose = atHour(now, SHOP_CLOSE_HOUR, 0);
  const readyIfStartNow = new Date(now.getTime() + PREP_HOURS * 60 * 60 * 1000);

  if (readyIfStartNow.getTime() <= todayClose.getTime()) {
    return new Date(now);
  }

  const nextOpen = atHour(addDays(now, 1), SHOP_OPEN_HOUR, 0);
  return nextOpen;
}

/**
 * Готовность заказа = начало готовки + 12 часов.
 * Доставка — не раньше готовности и только в часы 9:00–21:00.
 */
export function getEarliestDelivery(now = new Date()) {
  const cookingStart = getCookingStart(now);
  let readyAt = new Date(cookingStart.getTime() + PREP_HOURS * 60 * 60 * 1000);
  readyAt = snapToShopHours(readyAt);
  readyAt = roundUpToSlot(readyAt);
  return readyAt;
}

function snapToShopHours(date) {
  const d = new Date(date);
  const minutes = d.getHours() * 60 + d.getMinutes();
  const open = SHOP_OPEN_HOUR * 60;
  const close = SHOP_CLOSE_HOUR * 60;

  if (minutes < open) {
    d.setHours(SHOP_OPEN_HOUR, 0, 0, 0);
    return d;
  }

  if (minutes > close) {
    d.setDate(d.getDate() + 1);
    d.setHours(SHOP_OPEN_HOUR, 0, 0, 0);
    return d;
  }

  return d;
}

function roundUpToSlot(date) {
  const d = new Date(date);
  const minutes = d.getMinutes();
  const rem = minutes % SLOT_MINUTES;
  if (rem !== 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0) {
    const add = rem === 0 ? SLOT_MINUTES : SLOT_MINUTES - rem;
    d.setMinutes(minutes + add, 0, 0);
  } else {
    d.setSeconds(0, 0);
  }

  if (d.getHours() * 60 + d.getMinutes() > SHOP_CLOSE_HOUR * 60) {
    d.setDate(d.getDate() + 1);
    d.setHours(SHOP_OPEN_HOUR, 0, 0, 0);
  }

  return d;
}

export function getTimeSlotsForDate(isoDate, now = new Date()) {
  const earliest = getEarliestDelivery(now);
  const day = parseIsoDate(isoDate);
  const slots = [];

  for (let mins = SHOP_OPEN_HOUR * 60; mins <= SHOP_CLOSE_HOUR * 60; mins += SLOT_MINUTES) {
    const slot = new Date(day);
    slot.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    if (slot >= earliest) {
      slots.push(toTimeValue(slot));
    }
  }

  return slots;
}

export function isDateAvailable(isoDate, now = new Date()) {
  return getTimeSlotsForDate(isoDate, now).length > 0;
}

export function getDefaultDelivery(now = new Date()) {
  const earliest = getEarliestDelivery(now);
  return {
    date: toIsoDate(earliest),
    time: toTimeValue(earliest),
  };
}

export function getDeliveryHint(now = new Date()) {
  const earliest = getEarliestDelivery(now);
  const todayClose = atHour(now, SHOP_CLOSE_HOUR, 0);
  const fitsToday =
    now.getTime() + PREP_HOURS * 60 * 60 * 1000 <= todayClose.getTime();

  const prepNote = fitsToday
    ? 'Готовка 12 часов начинается сразу после заказа.'
    : '12 часов не умещаются до 21:00 — готовка с 9:00 следующего дня.';

  return `${prepNote} Магазин 9:00–21:00. Ближайшая доставка: ${formatDisplayDate(toIsoDate(earliest))}, с ${toTimeValue(earliest)}.`;
}
