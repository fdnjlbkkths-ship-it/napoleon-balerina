/**
 * Cloudflare Worker: приём заказов с сайта + Telegram webhook.
 *
 * Маршруты:
 *   POST /order      — новый заказ с сайта
 *   POST /analytics  — pageview (только после согласия на сайте)
 *   POST /telegram   — webhook Bot API
 *   POST /setup      — меню команд «/»
 *   GET  /health     — проверка
 *   GET  /diag       — диагностика
 */

const STATUS = {
  new: '🆕 Новый',
  in_progress: '⏳ В работе',
  done: '✅ Готов',
  cancelled: '❌ Отменён',
};

const ACTIVE = new Set(['new', 'in_progress']);

const BTN = {
  orders: '📋 Активные',
  done: '✅ Завершённые',
  help: 'ℹ️ Справка',
  menu: '🏠 Меню',
};

/** Slash-команды для меню «/» в Telegram */
const BOT_COMMANDS = [
  { command: 'start', description: 'Меню и кнопки управления' },
  { command: 'orders', description: 'Активные заказы (новые и в работе)' },
  { command: 'done', description: 'Завершённые заказы' },
  { command: 'stats', description: 'Статистика посещений сайта' },
  { command: 'help', description: 'Справка по боту' },
  { command: 'menu', description: 'Показать главное меню' },
];

const COMMANDS_CACHE_KEY = 'meta:bot_commands_v2';

const HELP_TEXT =
  'Заказы приходят с сайта автоматически.\n\n' +
  'Кнопки внизу экрана:\n' +
  `• ${BTN.orders} — новые и в работе\n` +
  `• ${BTN.done} — готовые и отменённые\n` +
  `• ${BTN.help} — эта справка\n\n` +
  'Команды в меню «/»:\n' +
  BOT_COMMANDS.map((c) => `/${c.command} — ${c.description}`).join('\n') +
  '\n\nПод карточкой заказа меняйте статус кнопками.\n' +
  'В списке можно открыть заказ отдельной кнопкой.\n' +
  '/stats — статистика посещений сайта (только с согласия гостей).';

const START_TEXT =
  'Бот заказов «Наполеон и Балерина» готов.\n\n' +
  'Пользуйтесь кнопками внизу — команды вводить не нужно.\n\n' +
  `${BTN.orders} · ${BTN.done} · ${BTN.help}\n\n` +
  'Список команд также в меню «/» в углу чата.';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }), request, env);
    }

    try {
      if (path === '/health') {
        return json({ ok: true });
      }

      if (path === '/diag' && request.method === 'GET') {
        if (url.searchParams.get('setup') === '1') {
          await env.ORDERS.delete(COMMANDS_CACHE_KEY);
          const setup = await registerBotCommands(env);
          if (setup?.ok) {
            await env.ORDERS.put(COMMANDS_CACHE_KEY, JSON.stringify(BOT_COMMANDS));
          }
          return json({
            ok: Boolean(setup?.ok),
            setup,
            commands: BOT_COMMANDS,
          });
        }
        return await handleDiag(env);
      }

      if (path === '/setup' && (request.method === 'POST' || request.method === 'GET')) {
        return await handleSetup(env);
      }

      if (path === '/order' && request.method === 'POST') {
        return cors(await handleOrder(request, env), request, env);
      }

      if (path === '/analytics' && request.method === 'POST') {
        return cors(await handleAnalytics(request, env), request, env);
      }

      if (path === '/telegram' && request.method === 'POST') {
        return await handleTelegram(request, env);
      }

      return json({ error: 'Not found', path }, 404);
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

  const antiBot = await evaluateAntiBot(body, env, ip);
  if (antiBot.action === 'reject') {
    return json({ error: antiBot.error || 'Forbidden' }, antiBot.status || 403);
  }
  if (antiBot.action === 'challenge') {
    return json(
      {
        error: 'challenge_required',
        message: 'Пройдите проверку «Я не робот» и отправьте заказ снова.',
        reasons: antiBot.reasons,
      },
      428
    );
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

/* ───────── Anti-bot (reCAPTCHA + heuristics) ───────── */

async function evaluateAntiBot(body, env, ip) {
  const reasons = [];
  const honeypot = String(body.website || body.company || '').trim();
  if (honeypot) {
    return { action: 'reject', error: 'Forbidden', status: 403, reasons: ['honeypot'] };
  }

  const startedAt = Number(body.startedAt) || 0;
  const now = Date.now();
  const elapsed = startedAt ? now - startedAt : 0;
  if (!startedAt || elapsed < 3500) reasons.push('too_fast');
  if (startedAt > now + 60_000) reasons.push('future_started');
  if (startedAt && now - startedAt > 2 * 60 * 60 * 1000) reasons.push('stale_session');
  if (!body.hasGestures) reasons.push('no_gestures');

  const v2Token = String(body.recaptchaV2Token || '').trim();
  const v3Token = String(body.recaptchaV3Token || '').trim();
  const v2Secret = String(env.RECAPTCHA_V2_SECRET || '').trim();
  const v3Secret = String(env.RECAPTCHA_V3_SECRET || '').trim();
  const minScore = Number(env.RECAPTCHA_V3_MIN_SCORE || 0.5);

  // Passed image/checkbox challenge — accept if Google confirms
  if (v2Token) {
    if (!v2Secret) {
      // Cannot verify — fall through to soft mode below
    } else {
      const v2 = await verifyRecaptcha(v2Secret, v2Token, ip);
      if (v2.success) return { action: 'allow', reasons: [] };
      return {
        action: 'challenge',
        reasons: [...reasons, 'v2_failed'],
      };
    }
  }

  if (v3Secret) {
    if (!v3Token) {
      reasons.push('missing_v3');
    } else {
      const v3 = await verifyRecaptcha(v3Secret, v3Token, ip);
      if (!v3.success) {
        reasons.push('v3_failed');
      } else if (typeof v3.score === 'number' && v3.score < minScore) {
        reasons.push('low_score');
      }
      if (v3.action && v3.action !== 'order') {
        reasons.push('bad_action');
      }
    }
  }

  // Extra velocity signal (soft): many recent attempts
  if (await isHighOrderVelocity(env, ip)) {
    reasons.push('high_velocity');
  }

  // Without Google secrets we cannot show image captcha — only hard-reject honeypot
  // and ignore soft heuristic challenges so real customers are not stuck.
  if (!v3Secret && !v2Secret) {
    return { action: 'allow', reasons: [] };
  }

  if (reasons.length) {
    return { action: 'challenge', reasons };
  }
  return { action: 'allow', reasons: [] };
}

async function verifyRecaptcha(secret, token, ip) {
  try {
    const params = new URLSearchParams();
    params.set('secret', secret);
    params.set('response', token);
    if (ip && ip !== 'unknown') params.set('remoteip', ip);

    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await res.json();
    return {
      success: Boolean(data.success),
      score: data.score,
      action: data.action,
      errorCodes: data['error-codes'] || [],
    };
  } catch (err) {
    console.error('siteverify failed', err);
    return { success: false, score: 0, action: '', errorCodes: ['network'] };
  }
}

async function isHighOrderVelocity(env, ip) {
  const key = `order-attempts:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const data = (await env.ORDERS.get(key, { type: 'json' })) || { count: 0, start: now };

  if (now - data.start >= 120) {
    data.count = 1;
    data.start = now;
  } else {
    data.count += 1;
  }

  await env.ORDERS.put(key, JSON.stringify(data), { expirationTtl: 300 });
  // 4+ attempts in 2 minutes → suspicious (challenge, not hard ban)
  return data.count >= 4;
}

/* ───────── Analytics (consented pageviews) ───────── */

async function handleAnalytics(request, env) {
  if (!checkOrigin(request, env)) {
    return json({ error: 'Forbidden origin' }, 403);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await allowRate(env, `analytics:${ip}`, 60, 60))) {
    return json({ error: 'Too many requests' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const pathName = clean(body.path || 'index.html', 80) || 'index.html';
  const referrer = clean(body.referrer || 'direct', 80) || 'direct';
  const screen = clean(body.screen || '', 24);
  const language = clean(body.language || '', 16);
  const day = moscowDayKey();
  const ua = request.headers.get('User-Agent') || '';

  const dayKey = `analytics:day:${day}`;
  const stats = (await env.ORDERS.get(dayKey, { type: 'json' })) || {
    total: 0,
    uniques: 0,
    pages: {},
    referrers: {},
    screens: {},
    languages: {},
  };

  stats.total += 1;
  stats.pages[pathName] = (stats.pages[pathName] || 0) + 1;
  stats.referrers[referrer] = (stats.referrers[referrer] || 0) + 1;
  if (screen) stats.screens[screen] = (stats.screens[screen] || 0) + 1;
  if (language) stats.languages[language] = (stats.languages[language] || 0) + 1;

  const visitorHash = await hashText(`${ip}|${ua.slice(0, 96)}|${day}`);
  const seenKey = `analytics:seen:${day}`;
  const seen = (await env.ORDERS.get(seenKey, { type: 'json' })) || {};
  if (!seen[visitorHash]) {
    seen[visitorHash] = 1;
    stats.uniques += 1;
    await env.ORDERS.put(seenKey, JSON.stringify(seen), { expirationTtl: 60 * 60 * 48 });
  }

  await env.ORDERS.put(dayKey, JSON.stringify(stats), { expirationTtl: 60 * 60 * 24 * 120 });

  const indexKey = 'analytics:days';
  const days = (await env.ORDERS.get(indexKey, { type: 'json' })) || [];
  if (!days.includes(day)) {
    days.push(day);
    if (days.length > 120) days.splice(0, days.length - 120);
    await env.ORDERS.put(indexKey, JSON.stringify(days));
  }

  return json({ ok: true });
}

async function sendAnalyticsStats(env, chatId) {
  const days = (await env.ORDERS.get('analytics:days', { type: 'json' })) || [];
  if (!days.length) {
    await tg(env, 'sendMessage', {
      chat_id: chatId,
      text:
        'Статистики пока нет.\n\n' +
        'Сбор идёт только у посетителей, которые нажали «Принять всё» на сайте.',
      reply_markup: mainReplyKeyboard(),
    });
    return;
  }

  const last7 = days.slice(-7).reverse();
  const lines = ['<b>Статистика посещений</b> (по согласию)\n'];

  let weekViews = 0;
  let weekUniques = 0;

  for (const day of last7) {
    const s = (await env.ORDERS.get(`analytics:day:${day}`, { type: 'json' })) || {
      total: 0,
      uniques: 0,
    };
    weekViews += s.total || 0;
    weekUniques += s.uniques || 0;
    lines.push(`📅 ${escapeHtml(day)} — ${s.total || 0} просм., ${s.uniques || 0} уник.`);
  }

  lines.push('');
  lines.push(`<b>7 дней:</b> ${weekViews} просмотров, ${weekUniques} уникальных`);

  const todayKey = days[days.length - 1];
  const today = (await env.ORDERS.get(`analytics:day:${todayKey}`, { type: 'json' })) || {
    pages: {},
    referrers: {},
  };
  const topPages = topEntries(today.pages, 5);
  const topRefs = topEntries(today.referrers, 5);

  if (topPages.length) {
    lines.push('');
    lines.push('<b>Сегодня — страницы:</b>');
    topPages.forEach(([k, v]) => lines.push(`• ${escapeHtml(k)} — ${v}`));
  }
  if (topRefs.length) {
    lines.push('');
    lines.push('<b>Сегодня — источники:</b>');
    topRefs.forEach(([k, v]) => lines.push(`• ${escapeHtml(k)} — ${v}`));
  }

  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: lines.join('\n'),
    parse_mode: 'HTML',
    reply_markup: mainReplyKeyboard(),
  });
}

function topEntries(obj, limit) {
  return Object.entries(obj || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function moscowDayKey(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

async function hashText(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

/* ───────── Telegram webhook ───────── */

async function handleTelegram(request, env) {
  const update = await request.json();
  console.log('update keys', Object.keys(update || {}));

  // Меню «/» в углу чата — один раз (кэш в KV)
  await ensureBotCommands(env);

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

  const action = resolveAdminAction(text);
  if (action === 'start' || action === 'menu') {
    await sendMenu(env, chatId);
  } else if (action === 'orders') {
    await sendOrderList(env, chatId, true);
  } else if (action === 'done') {
    await sendOrderList(env, chatId, false);
  } else if (action === 'stats') {
    await sendAnalyticsStats(env, chatId);
  } else if (action === 'help') {
    await sendHelp(env, chatId);
  } else {
    await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: 'Выберите действие кнопками внизу экрана.',
      reply_markup: mainReplyKeyboard(),
    });
  }

  return json({ ok: true });
}

function resolveAdminAction(text) {
  const raw = String(text || '').trim();
  const t = raw.toLowerCase();

  if (raw === BTN.orders || t.startsWith('/orders') || t === 'активные') return 'orders';
  if (raw === BTN.done || t.startsWith('/done') || t === 'завершённые' || t === 'завершенные') {
    return 'done';
  }
  if (t.startsWith('/stats') || t === 'статистика' || t === 'стата') return 'stats';
  if (raw === BTN.help || t.startsWith('/help') || t === 'справка') return 'help';
  if (raw === BTN.menu || t.startsWith('/start') || t.startsWith('/menu') || t === 'меню') {
    return t.startsWith('/start') ? 'start' : 'menu';
  }
  return null;
}

async function sendMenu(env, chatId) {
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: START_TEXT,
    reply_markup: mainReplyKeyboard(),
  });
}

async function sendHelp(env, chatId) {
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: HELP_TEXT,
    reply_markup: {
      inline_keyboard: [
        [
          { text: BTN.orders, callback_data: 'nav:orders' },
          { text: BTN.done, callback_data: 'nav:done' },
        ],
      ],
    },
  });
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
  let commands = null;

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

    const cmds = await tg(env, 'getMyCommands', {});
    if (cmds?.ok) commands = cmds.result;
  }

  return json({
    ok: hasToken && hasAdmin && Boolean(bot),
    hasToken,
    hasAdmin,
    tokenLength: token.length,
    tokenLooksValid: /^\d+:[A-Za-z0-9_-]+$/.test(token),
    adminIdEndsWith: admin ? admin.slice(-4) : null,
    bot,
    commands,
    expectedCommands: BOT_COMMANDS,
    telegramError,
    hint: bot
      ? `Пишите боту @${bot.username} команду /start. Меню «/»: POST /setup`
      : 'Снова: wrangler secret put BOT_TOKEN — вставьте токен без пробелов и звёздочек',
  });
}

async function handleSetup(env) {
  await env.ORDERS.delete(COMMANDS_CACHE_KEY);
  const result = await registerBotCommands(env);
  return json({
    ok: Boolean(result?.ok),
    commands: BOT_COMMANDS,
    telegram: result,
  });
}

async function ensureBotCommands(env) {
  try {
    const cached = await env.ORDERS.get(COMMANDS_CACHE_KEY);
    const fingerprint = JSON.stringify(BOT_COMMANDS);
    if (cached === fingerprint) return;
    const result = await registerBotCommands(env);
    if (result?.ok) {
      await env.ORDERS.put(COMMANDS_CACHE_KEY, fingerprint);
    }
  } catch (err) {
    console.error('ensureBotCommands', err);
  }
}

async function registerBotCommands(env) {
  return tg(env, 'setMyCommands', {
    commands: BOT_COMMANDS,
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

  const nav = /^nav:(\w+)$/.exec(data);
  if (nav) {
    const action = nav[1];
    await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
    if (action === 'orders') await sendOrderList(env, chatId, true);
    else if (action === 'done') await sendOrderList(env, chatId, false);
    else if (action === 'help') await sendHelp(env, chatId);
    else if (action === 'menu') await sendMenu(env, chatId);
    return;
  }

  const open = /^open:(.+)$/.exec(data);
  if (open) {
    const order = await getOrder(env, open[1]);
    if (!order) {
      await tg(env, 'answerCallbackQuery', {
        callback_query_id: cq.id,
        text: 'Заказ не найден',
        show_alert: true,
      });
      return;
    }
    await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
    await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: formatOrderHtml(order),
      parse_mode: 'HTML',
      reply_markup: statusKeyboard(order.id, order.status),
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
    if (orders.length >= 12) break;
  }

  if (!orders.length) {
    await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: activeOnly ? 'Активных заказов нет.' : 'Завершённых заказов пока нет.',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: activeOnly ? BTN.done : BTN.orders,
              callback_data: activeOnly ? 'nav:done' : 'nav:orders',
            },
            { text: BTN.menu, callback_data: 'nav:menu' },
          ],
        ],
      },
    });
    return;
  }

  const lines = orders.map((o, i) => {
    const when = formatDateTime(o.deliveryDate, o.deliveryTime) || '—';
    const who = escapeHtml(o.name || o.phone || 'Без имени');
    return `${i + 1}. ${STATUS[o.status]} <b>${escapeHtml(o.id)}</b> — ${who}\n   ${formatMoney(o.total)} · доставка ${escapeHtml(when)}`;
  });

  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: (activeOnly ? '<b>Активные заказы</b>\n\n' : '<b>Завершённые</b>\n\n') + lines.join('\n\n'),
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: orderListKeyboard(orders, activeOnly),
    },
  });
}

function mainReplyKeyboard() {
  return {
    keyboard: [
      [{ text: BTN.orders }, { text: BTN.done }],
      [{ text: BTN.help }, { text: BTN.menu }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

function orderListKeyboard(orders, activeOnly) {
  const rows = orders.map((o) => [
    {
      text: `${STATUS[o.status]} ${shortOrderId(o.id)} · ${formatMoney(o.total)}`,
      callback_data: `open:${o.id}`,
    },
  ]);

  rows.push([
    {
      text: activeOnly ? BTN.done : BTN.orders,
      callback_data: activeOnly ? 'nav:done' : 'nav:orders',
    },
    { text: BTN.menu, callback_data: 'nav:menu' },
  ]);

  return rows;
}

function shortOrderId(id) {
  const s = String(id || '');
  return s.length > 14 ? `…${s.slice(-10)}` : s;
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
      [
        { text: BTN.orders, callback_data: 'nav:orders' },
        { text: BTN.done, callback_data: 'nav:done' },
      ],
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
