/**
 * Cloudflare Worker: приём заказов с сайта + Telegram webhook.
 *
 * Маршруты:
 *   POST /order     — новый заказ с сайта
 *   POST /telegram  — webhook Bot API (кнопки статусов, /orders, /start)
 *   GET  /health    — проверка
 */

const STATUS = {
  new: '🆕 Новый',
  in_progress: '⏳ В работе',
  done: '✅ Готов',
  cancelled: '❌ Отменён',
};

const ACTIVE = new Set(['new', 'in_progress']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }), request, env);
    }

    try {
      if (url.pathname === '/health') {
        return json({ ok: true });
      }

      if (url.pathname === '/diag' && request.method === 'GET') {
        return await handleDiag(env);
      }

      if (url.pathname === '/order' && request.method === 'POST') {
        return cors(await handleOrder(request, env), request, env);
      }

      if (url.pathname === '/telegram' && request.method === 'POST') {
        return await handleTelegram(request, env);
      }

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error(err);
      return cors(json({ error: 'Internal error' }, 500), request, env);
    }
  },
};

/* ───────── Order from site ───────── */

async function handleOrder(request, env) {
  if (!checkOrigin(request, env)) {
    return json({ error: 'Forbidden origin' }, 403);
  }

  if (env.ORDER_SECRET) {
    const secret = request.headers.get('X-Order-Secret') || '';
    if (secret !== env.ORDER_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await allowRate(env, ip, 8, 60))) {
    return json({ error: 'Too many requests' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return json({ error: 'Cart is empty' }, 400);
  }

  const order = {
    id: makeOrderId(),
    createdAt: new Date().toISOString(),
    status: 'new',
    items: items.slice(0, 50).map(normalizeItem),
    total: Number(body.total) || calcTotal(items),
    name: clean(body.name, 80),
    phone: clean(body.phone, 40),
    address: clean(body.address, 200),
    deliveryDate: clean(body.deliveryDate, 20),
    deliveryTime: clean(body.deliveryTime, 20),
    comment: clean(body.comment, 500),
    shopName: clean(body.shopName, 80) || 'Наполеон и Балерина',
  };

  await saveOrder(env, order);

  const text = formatOrderHtml(order);
  const keyboard = statusKeyboard(order.id, order.status);
  const sent = await tg(env, 'sendMessage', {
    chat_id: env.ADMIN_CHAT_ID,
    text,
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });

  if (sent?.ok && sent.result?.message_id) {
    order.messageId = sent.result.message_id;
    order.chatId = sent.result.chat?.id;
    await saveOrder(env, order);
  }

  return json({ ok: true, orderId: order.id });
}

/* ───────── Telegram webhook ───────── */

async function handleTelegram(request, env) {
  const update = await request.json();
  console.log('update keys', Object.keys(update || {}));

  if (update.callback_query) {
    await onCallback(update.callback_query, env);
    return json({ ok: true });
  }

  const msg = update.message || update.edited_message;
  if (!msg) {
    console.log('no message in update');
    return json({ ok: true });
  }

  const chatId = msg.chat?.id;
  const text = String(msg.text || msg.caption || '').trim();
  console.log('chat', chatId, 'text', text.slice(0, 40));

  if (!text) return json({ ok: true });

  const admin = isAdmin(chatId, env);
  console.log('isAdmin', admin, 'ADMIN_CHAT_ID set', Boolean(env.ADMIN_CHAT_ID));

  if (!admin) {
    const sent = await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: 'Этот бот принимает заказы с сайта кондитерской. Управление — только для администратора.',
    });
    console.log('non-admin reply', sent?.ok, sent?.description);
    return json({ ok: true });
  }

  if (text.startsWith('/start')) {
    const sent = await tg(env, 'sendMessage', {
      chat_id: chatId,
      text:
        'Бот заказов «Наполеон и Балерина» готов.\n\n' +
        'Команды:\n' +
        '/orders — активные заказы\n' +
        '/done — завершённые (последние 20)\n' +
        '/help — справка',
    });
    console.log('start reply', sent?.ok, sent?.description);
  } else if (text.startsWith('/orders')) {
    await sendOrderList(env, chatId, true);
  } else if (text.startsWith('/done')) {
    await sendOrderList(env, chatId, false);
  } else if (text.startsWith('/help')) {
    const sent = await tg(env, 'sendMessage', {
      chat_id: chatId,
      text:
        'Заказы приходят с сайта автоматически.\n' +
        'Меняйте статус кнопками под карточкой.\n' +
        '/orders — новые и в работе\n' +
        '/done — готовые и отменённые',
    });
    console.log('help reply', sent?.ok, sent?.description);
  } else {
    const sent = await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: 'Команды: /orders, /done, /help',
    });
    console.log('fallback reply', sent?.ok, sent?.description);
  }

  return json({ ok: true });
}

async function handleDiag(env) {
  const rawToken = String(env.BOT_TOKEN || '');
  const token = rawToken.replace(/^\uFEFF/, '').replace(/[\r\n\t ]+/g, '').trim();
  const adminRaw = String(env.ADMIN_CHAT_ID || '');
  const admin = adminRaw.replace(/^\uFEFF/, '').replace(/\D/g, '');

  const hasToken = Boolean(token);
  const hasAdmin = Boolean(admin);

  let bot = null;
  let telegramError = null;

  if (hasToken) {
    const me = await tg(env, 'getMe', {});
    if (me?.ok) {
      bot = {
        id: me.result.id,
        username: me.result.username,
        name: me.result.first_name,
      };
    } else {
      telegramError = me?.description || 'getMe failed';
    }
  }

  return json({
    ok: hasToken && hasAdmin && Boolean(bot),
    hasToken,
    hasAdmin,
    tokenLength: token.length,
    tokenLooksValid: /^\d+:[A-Za-z0-9_-]+$/.test(token),
    adminIdEndsWith: admin ? admin.slice(-4) : null,
    bot,
    telegramError,
    hint: bot
      ? `Пишите боту @${bot.username} команду /start`
      : 'Снова: wrangler secret put BOT_TOKEN — вставьте токен без пробелов и звёздочек',
  });
}

async function onCallback(cq, env) {
  const data = cq.data || '';
  const chatId = String(cq.message?.chat?.id || '');

  if (!isAdmin(chatId, env)) {
    await tg(env, 'answerCallbackQuery', {
      callback_query_id: cq.id,
      text: 'Нет доступа',
      show_alert: true,
    });
    return;
  }

  const match = /^status:([^:]+):(\w+)$/.exec(data);
  if (!match) {
    await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
    return;
  }

  const [, orderId, nextStatus] = match;
  if (!STATUS[nextStatus]) {
    await tg(env, 'answerCallbackQuery', {
      callback_query_id: cq.id,
      text: 'Неизвестный статус',
      show_alert: true,
    });
    return;
  }

  const order = await getOrder(env, orderId);
  if (!order) {
    await tg(env, 'answerCallbackQuery', {
      callback_query_id: cq.id,
      text: 'Заказ не найден',
      show_alert: true,
    });
    return;
  }

  order.status = nextStatus;
  order.updatedAt = new Date().toISOString();
  await saveOrder(env, order);
  await rebuildActiveIndex(env);

  const text = formatOrderHtml(order);
  await tg(env, 'editMessageText', {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    text,
    parse_mode: 'HTML',
    reply_markup: statusKeyboard(order.id, order.status),
  });

  await tg(env, 'answerCallbackQuery', {
    callback_query_id: cq.id,
    text: STATUS[nextStatus],
  });
}

async function sendOrderList(env, chatId, activeOnly) {
  const ids = (await env.ORDERS.get('index:all', { type: 'json' })) || [];
  const orders = [];

  for (const id of ids.slice(-100).reverse()) {
    const o = await getOrder(env, id);
    if (!o) continue;
    if (activeOnly && !ACTIVE.has(o.status)) continue;
    if (!activeOnly && ACTIVE.has(o.status)) continue;
    orders.push(o);
    if (orders.length >= 20) break;
  }

  if (!orders.length) {
    await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: activeOnly ? 'Активных заказов нет.' : 'Завершённых заказов пока нет.',
    });
    return;
  }

  const lines = orders.map((o) => {
    const when = formatDateTime(o.deliveryDate, o.deliveryTime) || '—';
    const who = escapeHtml(o.name || o.phone || 'Без имени');
    return `${STATUS[o.status]} <b>${escapeHtml(o.id)}</b> — ${who}\n   ${formatMoney(o.total)} · доставка ${escapeHtml(when)}`;
  });

  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: (activeOnly ? '<b>Активные заказы</b>\n\n' : '<b>Завершённые</b>\n\n') + lines.join('\n\n'),
    parse_mode: 'HTML',
  });
}

/* ───────── Storage ───────── */

async function saveOrder(env, order) {
  await env.ORDERS.put(`order:${order.id}`, JSON.stringify(order));

  const all = (await env.ORDERS.get('index:all', { type: 'json' })) || [];
  if (!all.includes(order.id)) {
    all.push(order.id);
    if (all.length > 500) all.splice(0, all.length - 500);
    await env.ORDERS.put('index:all', JSON.stringify(all));
  }

  await rebuildActiveIndex(env);
}

async function rebuildActiveIndex(env) {
  const all = (await env.ORDERS.get('index:all', { type: 'json' })) || [];
  const active = [];
  for (const id of all) {
    const o = await getOrder(env, id);
    if (o && ACTIVE.has(o.status)) active.push(id);
  }
  await env.ORDERS.put('index:active', JSON.stringify(active));
}

async function getOrder(env, id) {
  return env.ORDERS.get(`order:${id}`, { type: 'json' });
}

/* ───────── Formatting ───────── */

function formatOrderHtml(order) {
  const lines = [];
  lines.push(`🍰 <b>ЗАКАЗ ${escapeHtml(order.id)}</b>`);
  lines.push(`Статус: ${STATUS[order.status] || order.status}`);
  lines.push(`Создан: ${escapeHtml(formatIso(order.createdAt))}`);
  lines.push('');
  lines.push('<b>Состав:</b>');

  order.items.forEach((item, i) => {
    const sum = formatMoney(item.price * item.quantity);
    lines.push(
      `${i + 1}. ${escapeHtml(item.name)} × ${item.quantity} — ${sum}`
    );
  });

  lines.push('');
  lines.push(`💰 <b>Итого: ${formatMoney(order.total)}</b>`);
  lines.push('');

  if (order.name) lines.push(`👤 ${escapeHtml(order.name)}`);
  if (order.phone) lines.push(`📞 ${escapeHtml(order.phone)}`);
  if (order.address) lines.push(`📍 ${escapeHtml(order.address)}`);
  if (order.deliveryDate || order.deliveryTime) {
    lines.push(`📅 ${escapeHtml(formatDateTime(order.deliveryDate, order.deliveryTime))}`);
  }
  if (order.comment) lines.push(`💬 ${escapeHtml(order.comment)}`);

  return lines.join('\n');
}

function statusKeyboard(orderId, current) {
  const row = (status, label) => ({
    text: current === status ? `• ${label} •` : label,
    callback_data: `status:${orderId}:${status}`,
  });

  return {
    inline_keyboard: [
      [row('new', '🆕 Новый'), row('in_progress', '⏳ В работе')],
      [row('done', '✅ Готов'), row('cancelled', '❌ Отменён')],
    ],
  };
}

/* ───────── Telegram API ───────── */

async function tg(env, method, payload) {
  const token = String(env.BOT_TOKEN || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\r\n\t ]+/g, '')
    .trim();

  if (!token) {
    console.error('BOT_TOKEN is missing');
    return { ok: false, description: 'BOT_TOKEN missing' };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error('Telegram API error', method, data);
  }
  return data;
}

function isAdmin(chatId, env) {
  const incoming = String(chatId ?? '').replace(/\D/g, '');
  const admin = String(env.ADMIN_CHAT_ID || '')
    .replace(/^\uFEFF/, '')
    .replace(/\D/g, '');
  const allowed = String(env.ADMIN_CHAT_IDS || '')
    .split(',')
    .map((s) => s.replace(/\D/g, ''))
    .filter(Boolean);
  if (admin) allowed.push(admin);
  return Boolean(incoming) && allowed.includes(incoming);
}

/* ───────── Helpers ───────── */

function makeOrderId() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `NB-${t}-${r}`;
}

function normalizeItem(item) {
  return {
    id: item.id,
    name: clean(item.name, 120) || 'Товар',
    price: Number(item.price) || 0,
    quantity: Math.min(99, Math.max(1, Number(item.quantity) || 1)),
  };
}

function calcTotal(items) {
  return items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
}

function clean(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(n) {
  return `${Math.round(Number(n) || 0).toLocaleString('ru-RU')} ₽`;
}

function formatIso(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  } catch {
    return iso;
  }
}

function formatDateTime(date, time) {
  let d = date || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-');
    d = `${day}.${m}.${y}`;
  }
  return [d, time].filter(Boolean).join(' ');
}

async function allowRate(env, ip, limit, windowSec) {
  const key = `rate:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const data = (await env.ORDERS.get(key, { type: 'json' })) || { count: 0, start: now };

  if (now - data.start >= windowSec) {
    data.count = 1;
    data.start = now;
  } else {
    data.count += 1;
  }

  await env.ORDERS.put(key, JSON.stringify(data), { expirationTtl: windowSec * 2 });
  return data.count <= limit;
}

function checkOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Если список не задан — пропускаем (удобно для первого запуска).
  if (!allowed.length) return true;
  if (!origin) return true;
  return allowed.some((o) => origin === o || origin.endsWith(o.replace(/^https?:\/\//, '')));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function cors(response, request, env) {
  const origin = request.headers.get('Origin') || '*';
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let allow = '*';
  if (allowed.length) {
    allow = allowed.includes(origin) ? origin : allowed[0];
  } else if (origin && origin !== 'null') {
    allow = origin;
  }

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allow);
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Order-Secret');
  headers.set('Vary', 'Origin');

  return new Response(response.body, { status: response.status, headers });
}
