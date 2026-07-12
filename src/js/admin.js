import '../scss/admin.scss';
import { smartMatchAny } from './smart-search.js';
import { formatSizeDisplay } from './format-size.js';

const DRAFT_KEY = 'napoleon-admin-draft';
const PIN_KEY = 'napoleon-admin-pin';

let catalog = null;
let selectedId = null;
let dirty = false;
let hydrating = false;
let pin = sessionStorage.getItem(PIN_KEY) || '';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function toast(msg, isError = false) {
  const el = $('#admin-toast');
  if (!el) return;
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle('is-error', isError);
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

function markDirty(value = true) {
  dirty = value;
  const btn = $('#admin-save');
  if (btn) btn.classList.toggle('is-dirty', dirty);
  const st = $('#admin-status');
  if (st) st.textContent = dirty ? 'есть несохранённые изменения' : 'сохранено';
}

function headers(json = true) {
  const h = {};
  if (json) h['Content-Type'] = 'application/json';
  if (pin) h['X-Admin-Pin'] = pin;
  return h;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { ...headers(options.body && !(options.body instanceof FormData)), ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function persistDraft() {
  if (!catalog) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ catalog, selectedId, at: Date.now() }));
  } catch {
    /* ignore quota */
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function formatPrice(n) {
  return new Intl.NumberFormat('ru-RU').format(Number(n) || 0) + ' ₽';
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getProduct(id) {
  return catalog?.products.find((p) => p.id === id);
}

/** Drop or repair drafts that wiped catalog fields (empty form flush bug). */
function sanitizeDraftCatalog(draftCatalog, loaded) {
  if (!draftCatalog || !loaded) return null;
  if (!Array.isArray(draftCatalog.products) || !Array.isArray(draftCatalog.categories)) return null;
  if (!draftCatalog.products.length || !draftCatalog.categories.length) return null;
  if (draftCatalog.products.length < Math.max(1, Math.floor(loaded.products.length * 0.5))) return null;
  if (draftCatalog.categories.length < loaded.categories.length) {
    draftCatalog.categories = structuredClone(loaded.categories);
  }

  const byId = new Map(loaded.products.map((p) => [p.id, p]));
  let repaired = 0;
  draftCatalog.products = draftCatalog.products.map((p) => {
    const src = byId.get(p.id);
    if (!src) return p;
    const out = { ...p };
    let changed = false;
    for (const key of ['name', 'description', 'fullDescription', 'composition', 'weight', 'size', 'prepTime', 'shelfLife']) {
      if (!String(out[key] ?? '').trim() && String(src[key] ?? '').trim()) {
        out[key] = src[key];
        changed = true;
      }
    }
    if ((!out.price || out.price === 0) && src.price) {
      out.price = src.price;
      changed = true;
    }
    if ((!Array.isArray(out.fillings) || !out.fillings.length) && src.fillings?.length) {
      out.fillings = [...src.fillings];
      changed = true;
    }
    if ((!Array.isArray(out.images) || !out.images.length) && src.images?.length) {
      out.images = [...src.images];
      out.image = src.image || src.images[0];
      changed = true;
    }
    if (changed) repaired += 1;
    return out;
  });

  const named = draftCatalog.products.filter((p) => p?.name?.trim()).length;
  if (named < Math.max(1, Math.floor(loaded.products.length * 0.5))) return null;
  return { catalog: draftCatalog, repaired };
}

function nextProductId() {
  return Math.max(0, ...catalog.products.map((p) => p.id)) + 1;
}

/* ---------- Auth ---------- */

async function initAuth() {
  let status;
  try {
    status = await api('/api/admin/status');
  } catch {
    $('#admin-auth').classList.remove('hidden');
    $('#admin-auth').innerHTML = `
      <div class="admin-auth__card">
        <h1>Админка недоступна</h1>
        <p>Запустите сайт через <code>npm run dev</code> и откройте
        <a href="/admin.html">/admin.html</a> на localhost.</p>
      </div>`;
    return false;
  }

  if (!status.pinRequired) {
    $('#admin-pin-warn').hidden = false;
    return true;
  }

  if (pin) {
    try {
      await api('/api/admin/auth', { method: 'POST', body: JSON.stringify({ pin }) });
      return true;
    } catch {
      sessionStorage.removeItem(PIN_KEY);
      pin = '';
    }
  }

  $('#admin-auth').classList.remove('hidden');
  $('#admin-auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = $('#admin-pin').value.trim();
    try {
      await api('/api/admin/auth', { method: 'POST', body: JSON.stringify({ pin: value }) });
      pin = value;
      sessionStorage.setItem(PIN_KEY, pin);
      $('#admin-auth').classList.add('hidden');
      await bootApp();
    } catch (err) {
      const errEl = $('#admin-auth-error');
      errEl.hidden = false;
      errEl.textContent = err.message;
    }
  });
  return false;
}

/* ---------- Tabs ---------- */

function initTabs() {
  $$('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.admin-tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      const name = tab.dataset.tab;
      $('#tab-products').classList.toggle('hidden', name !== 'products');
      $('#tab-categories').classList.toggle('hidden', name !== 'categories');
      $('#tab-shop').classList.toggle('hidden', name !== 'shop');
      if (name === 'categories') renderCategories();
      if (name === 'shop') fillShopForm();
    });
  });
}

/* ---------- Products list ---------- */

function renderCategoryFilter() {
  const sel = $('#product-category-filter');
  sel.innerHTML =
    `<option value="all">Все категории</option>` +
    catalog.categories.map((c) => `<option value="${c.id}">${c.icon || ''} ${c.name}</option>`).join('');
}

function filteredProducts() {
  const q = ($('#product-search').value || '').trim();
  const cat = $('#product-category-filter').value;
  const onlyHidden = $('#product-hidden-only').checked;

  return catalog.products.filter((p) => {
    if (cat !== 'all' && p.category !== cat) return false;
    if (onlyHidden && !p.hidden) return false;
    if (q && !smartMatchAny([p.name, p.description, p.fullDescription, p.composition], q)) return false;
    return true;
  });
}

function renderProductList() {
  const list = $('#product-list');
  const items = filteredProducts();
  if (!items.length) {
    list.innerHTML = `<p class="admin-empty">Ничего не найдено</p>`;
    return;
  }

  list.innerHTML = items
    .map((p) => {
      const cover = p.image || p.images?.[0] || '';
      return `
      <button type="button" class="admin-list__item${p.id === selectedId ? ' is-active' : ''}${p.hidden ? ' is-hidden' : ''}" data-id="${p.id}">
        <img src="/${cover}" alt="" width="48" height="48" loading="lazy">
        <span class="admin-list__meta">
          <strong>${escapeHtml(p.name)}</strong>
          <small>${formatPrice(p.price)}${p.hidden ? ' · скрыт' : ''}</small>
        </span>
      </button>`;
    })
    .join('');

  list.querySelectorAll('[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => selectProduct(Number(btn.dataset.id)));
  });
}

function collectProductImages({ categoryId = null, excludePaths = [] } = {}) {
  const seen = new Set(excludePaths.filter(Boolean));
  const items = [];
  for (const p of catalog.products) {
    if (categoryId && p.category !== categoryId) continue;
    const imgs = [];
    if (Array.isArray(p.images)) imgs.push(...p.images);
    if (p.image) imgs.unshift(p.image);
    for (const src of imgs) {
      if (!src || seen.has(src)) continue;
      seen.add(src);
      items.push({ src, productName: p.name, productId: p.id });
    }
  }
  return items;
}

let pickerCallback = null;

function openImagePicker({ title, hint, images, onPick }) {
  pickerCallback = onPick;
  const modal = $('#image-picker');
  $('#image-picker-title').textContent = title || 'Выберите фото';
  $('#image-picker-hint').textContent = hint || '';
  const grid = $('#image-picker-grid');
  if (!images.length) {
    grid.innerHTML = `<p class="admin-empty">Нет фото для выбора. Сначала загрузите фото у товаров.</p>`;
  } else {
    grid.innerHTML = images
      .map(
        (item) => `
      <button type="button" class="admin-picker__item" data-src="${escapeHtml(item.src)}" title="${escapeHtml(item.productName || '')}">
        <img src="/${item.src}" alt="" loading="lazy">
        <span>${escapeHtml((item.productName || '').slice(0, 42))}</span>
      </button>`
      )
      .join('');
    grid.querySelectorAll('[data-src]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const src = btn.dataset.src;
        const cb = pickerCallback;
        pickerCallback = null;
        closeImagePicker();
        if (src && cb) cb(src);
      });
    });
  }
  modal.classList.remove('hidden');
}

function closeImagePicker() {
  $('#image-picker')?.classList.add('hidden');
}

function initImagePicker() {
  const modal = $('#image-picker');
  if (!modal || modal.dataset.bound) return;
  modal.dataset.bound = '1';
  modal.querySelectorAll('[data-picker-close]').forEach((el) => {
    el.addEventListener('click', () => {
      pickerCallback = null;
      closeImagePicker();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      pickerCallback = null;
      closeImagePicker();
    }
  });
}

/* ---------- Product editor ---------- */

function fillCategorySelects(product) {
  const catSel = $('#field-category');
  catSel.innerHTML = catalog.categories
    .map((c) => `<option value="${c.id}" ${c.id === product.category ? 'selected' : ''}>${c.icon || ''} ${c.name}</option>`)
    .join('');
  fillSubcategorySelect(product.category, product.subcategory);
}

function fillSubcategorySelect(categoryId, selected) {
  const subSel = $('#field-subcategory');
  const cat = catalog.categories.find((c) => c.id === categoryId);
  const subs = cat?.subcategories || [];
  if (!subs.length) {
    subSel.innerHTML = `<option value="">—</option>`;
    subSel.disabled = true;
    return;
  }
  subSel.disabled = false;
  subSel.innerHTML =
    `<option value="">—</option>` +
    subs
      .map(
        (s) =>
          `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${s.icon ? s.icon + ' ' : ''}${s.name}</option>`
      )
      .join('');
}

function selectProduct(id, { skipFlush = false } = {}) {
  // Never flush before the form is filled — empty inputs would wipe the product
  // (happens on boot when restoring a draft with selectedId already set).
  if (!skipFlush) flushEditorToCatalog();
  selectedId = id;
  const product = getProduct(id);
  if (!product) return;

  hydrating = true;
  $('#product-empty').classList.add('hidden');
  $('#product-editor').classList.remove('hidden');
  $('#product-editor-title').textContent = product.name;
  $('#product-open').href = `product.html?id=${product.id}`;

  $('#field-name').value = product.name || '';
  $('#field-price').value = product.price ?? '';
  $('#field-priceOld').value = product.priceOld ?? '';
  $('#field-weight').value = product.weight || '';
  $('#field-size').value = formatSizeDisplay(product.size || '');
  $('#field-prepTime').value = product.prepTime || '';
  $('#field-shelfLife').value = product.shelfLife || '';
  $('#field-description').value = product.description || '';
  $('#field-fullDescription').value = product.fullDescription || '';
  $('#field-composition').value = product.composition || '';
  $('#field-hidden').checked = Boolean(product.hidden);
  fillCategorySelects(product);
  renderFillings(product);
  renderGallery(product);
  hydrating = false;
  renderProductList();
  persistDraft();
}

function flushEditorToCatalog() {
  if (hydrating) return;
  if (!selectedId || !catalog) return;
  const product = getProduct(selectedId);
  if (!product) return;

  const editor = $('#product-editor');
  if (!editor || editor.classList.contains('hidden')) return;

  const name = $('#field-name').value.trim();
  // Guard against empty-form races wiping a known product
  if (!name && product.name) return;

  product.name = name;
  product.price = Number($('#field-price').value) || 0;
  const old = $('#field-priceOld').value;
  product.priceOld = old === '' ? null : Number(old) || null;
  product.weight = $('#field-weight').value.trim() || null;
  product.size = formatSizeDisplay($('#field-size').value.trim()) || null;
  product.prepTime = $('#field-prepTime').value.trim() || null;
  product.shelfLife = $('#field-shelfLife').value.trim() || null;
  product.description = $('#field-description').value.trim();
  product.fullDescription = $('#field-fullDescription').value.trim();
  product.composition = $('#field-composition')?.value.trim() || product.composition || '';
  product.hidden = $('#field-hidden').checked;
  product.category = $('#field-category').value;
  const sub = $('#field-subcategory').value;
  product.subcategory = sub || null;
  product.alt = product.name;
  if (product.images?.length) product.image = product.images[0];
}

function bindEditorEvents() {
  const form = $('#product-editor');
  form.addEventListener('input', () => {
    if (hydrating) return;
    if (selectedId) flushEditorToCatalog();
    markDirty();
    persistDraft();
  });
  form.addEventListener('change', () => {
    if (hydrating) return;
    if (selectedId) {
      flushEditorToCatalog();
      renderProductList();
      $('#product-editor-title').textContent = getProduct(selectedId)?.name || '';
    }
    markDirty();
    persistDraft();
  });

  $('#field-category').addEventListener('change', () => {
    fillSubcategorySelect($('#field-category').value, '');
  });

  $('#filling-add').addEventListener('click', addFilling);
  $('#filling-new').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addFilling();
    }
  });

  $('#gallery-upload').addEventListener('change', onGalleryUpload);
  $('#gallery-pick')?.addEventListener('click', () => {
    const product = getProduct(selectedId);
    if (!product) return;
    openImagePicker({
      title: 'Добавить фото товара',
      hint: 'Выберите готовое фото из каталога — оно добавится в галерею',
      images: collectProductImages({
        excludePaths: product.images || [],
      }),
      onPick: (src) => {
        if (!Array.isArray(product.images)) product.images = [];
        product.images.push(src);
        product.image = product.images[0];
        markDirty();
        renderGallery(product);
        renderProductList();
        persistDraft();
        toast('Фото добавлено');
      },
    });
  });
  $('#product-duplicate').addEventListener('click', duplicateProduct);

  $('#product-search').addEventListener('input', renderProductList);
  $('#product-category-filter').addEventListener('change', renderProductList);
  $('#product-hidden-only').addEventListener('change', renderProductList);
}

function renderFillings(product) {
  const box = $('#fillings-chips');
  const fillings = Array.isArray(product.fillings) ? product.fillings : [];
  box.innerHTML = fillings
    .map((f, i) => {
      const extra = /малин/i.test(f) ? ' <em>+400 ₽</em>' : '';
      return `<span class="admin-chip" data-i="${i}">${escapeHtml(f)}${extra}<button type="button" aria-label="Удалить">×</button></span>`;
    })
    .join('');

  box.querySelectorAll('.admin-chip button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.closest('.admin-chip').dataset.i);
      product.fillings.splice(i, 1);
      markDirty();
      renderFillings(product);
      persistDraft();
    });
  });
}

function addFilling() {
  const product = getProduct(selectedId);
  if (!product) return;
  const input = $('#filling-new');
  const value = input.value.trim();
  if (!value) return;
  if (!Array.isArray(product.fillings)) product.fillings = [];
  if (product.fillings.includes(value)) {
    toast('Такая начинка уже есть', true);
    return;
  }
  product.fillings.push(value);
  input.value = '';
  markDirty();
  renderFillings(product);
  persistDraft();
}

function renderGallery(product) {
  const box = $('#gallery');
  const images = Array.isArray(product.images) ? [...product.images] : [];
  if (!images.length && product.image) images.push(product.image);
  product.images = images;

  box.innerHTML = images
    .map(
      (src, i) => `
    <div class="admin-gallery__item" draggable="true" data-i="${i}">
      <img src="/${src}" alt="">
      <span class="admin-gallery__badge">${i + 1}</span>
      <div class="admin-gallery__tools">
        <button type="button" data-act="cover" title="Обложка">★</button>
        <button type="button" data-act="up" title="Вверх">↑</button>
        <button type="button" data-act="down" title="Вниз">↓</button>
        <button type="button" data-act="pick" title="Заменить из каталога">▦</button>
        <button type="button" data-act="del" title="Удалить">×</button>
      </div>
      <label class="admin-gallery__replace">
        Загрузить файл
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-replace="${i}" hidden>
      </label>
    </div>`
    )
    .join('');

  box.querySelectorAll('.admin-gallery__item').forEach((item) => {
    const i = Number(item.dataset.i);

    item.querySelector('[data-act="cover"]')?.addEventListener('click', () => {
      const [img] = product.images.splice(i, 1);
      product.images.unshift(img);
      product.image = product.images[0];
      markDirty();
      renderGallery(product);
      renderProductList();
      persistDraft();
    });
    item.querySelector('[data-act="up"]')?.addEventListener('click', () => {
      if (i === 0) return;
      [product.images[i - 1], product.images[i]] = [product.images[i], product.images[i - 1]];
      product.image = product.images[0];
      markDirty();
      renderGallery(product);
      persistDraft();
    });
    item.querySelector('[data-act="down"]')?.addEventListener('click', () => {
      if (i >= product.images.length - 1) return;
      [product.images[i + 1], product.images[i]] = [product.images[i], product.images[i + 1]];
      product.image = product.images[0];
      markDirty();
      renderGallery(product);
      persistDraft();
    });
    item.querySelector('[data-act="pick"]')?.addEventListener('click', () => {
      const exclude = [product.images[i]].filter(Boolean);
      const fromCat = collectProductImages({ categoryId: product.category, excludePaths: exclude });
      const used = new Set(fromCat.map((x) => x.src));
      const rest = collectProductImages({ excludePaths: exclude }).filter((x) => !used.has(x.src));
      openImagePicker({
        title: `Заменить фото ${i + 1}`,
        hint: 'Сначала фото этой категории, затем остальные товары',
        images: [...fromCat, ...rest],
        onPick: (src) => {
          product.images[i] = src;
          product.image = product.images[0];
          markDirty();
          renderGallery(product);
          renderProductList();
          persistDraft();
          toast('Фото заменено');
        },
      });
    });
    item.querySelector('[data-act="del"]')?.addEventListener('click', () => {
      product.images.splice(i, 1);
      product.image = product.images[0] || '';
      markDirty();
      renderGallery(product);
      renderProductList();
      persistDraft();
    });
    item.querySelector('[data-replace]')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const path = await uploadFile(file);
        product.images[i] = path;
        product.image = product.images[0];
        markDirty();
        renderGallery(product);
        renderProductList();
        persistDraft();
        toast('Фото заменено');
      } catch (err) {
        toast(err.message, true);
      }
    });

    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(i));
      item.classList.add('is-dragging');
    });
    item.addEventListener('dragend', () => item.classList.remove('is-dragging'));
    item.addEventListener('dragover', (e) => e.preventDefault());
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      const to = i;
      if (Number.isNaN(from) || from === to) return;
      const [img] = product.images.splice(from, 1);
      product.images.splice(to, 0, img);
      product.image = product.images[0];
      markDirty();
      renderGallery(product);
      renderProductList();
      persistDraft();
    });
  });
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/admin/upload', {
    method: 'POST',
    headers: pin ? { 'X-Admin-Pin': pin } : {},
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.path;
}

async function onGalleryUpload(e) {
  const product = getProduct(selectedId);
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!product || !file) return;
  try {
    const path = await uploadFile(file);
    if (!Array.isArray(product.images)) product.images = [];
    product.images.push(path);
    product.image = product.images[0];
    markDirty();
    renderGallery(product);
    renderProductList();
    persistDraft();
    toast('Фото загружено');
  } catch (err) {
    toast(err.message, true);
  }
}

function duplicateProduct() {
  flushEditorToCatalog();
  const src = getProduct(selectedId);
  if (!src) return;
  const copy = structuredClone(src);
  copy.id = nextProductId();
  copy.slug = `${src.slug || 'product'}-copy-${copy.id}`;
  copy.name = `${src.name} (копия)`;
  copy.hidden = true;
  catalog.products.push(copy);
  markDirty();
  renderProductList();
  selectProduct(copy.id);
  toast('Копия создана (скрыта). Сохраните в файл.');
  persistDraft();
}

/* ---------- Categories ---------- */

function renderCategories() {
  const box = $('#category-list');
  box.innerHTML = catalog.categories
    .map(
      (c) => `
    <article class="admin-cat${c.hidden ? ' is-hidden' : ''}" data-cat="${c.id}">
      <div class="admin-cat__cover">
        <img src="/${c.image || ''}" alt="" class="admin-cat__img" data-cat-preview>
        <div class="admin-cat__cover-actions">
          <label class="admin-btn admin-btn--primary">
            Загрузить файл
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-upload-cat="${c.id}" hidden>
          </label>
          <button type="button" class="admin-btn" data-pick-cat="${c.id}">Из фото товаров</button>
        </div>
      </div>
      <div class="admin-cat__body">
        <label class="admin-field">
          <span>Название</span>
          <input type="text" class="admin-input" data-f="name" value="${escapeHtml(c.name)}">
        </label>
        <label class="admin-field">
          <span>Иконка</span>
          <input type="text" class="admin-input" data-f="icon" value="${escapeHtml(c.icon || '')}">
        </label>
        <label class="admin-field">
          <span>Путь к обложке</span>
          <input type="text" class="admin-input" data-f="image" value="${escapeHtml(c.image || '')}">
        </label>
        <label class="admin-switch">
          <input type="checkbox" data-f="hidden" ${c.hidden ? 'checked' : ''}>
          <span>Скрыта на сайте</span>
        </label>
      </div>
    </article>`
    )
    .join('');

  box.querySelectorAll('[data-cat]').forEach((card) => {
    const id = card.dataset.cat;
    const cat = catalog.categories.find((c) => c.id === id);

    const applyImage = (path) => {
      cat.image = path;
      markDirty();
      const preview = card.querySelector('[data-cat-preview]');
      const pathInput = card.querySelector('[data-f="image"]');
      if (preview) preview.src = `/${path}`;
      if (pathInput) pathInput.value = path;
      persistDraft();
    };

    card.querySelectorAll('[data-f]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.f;
        if (key === 'hidden') cat.hidden = input.checked;
        else cat[key] = input.value.trim();
        if (key === 'image') {
          const preview = card.querySelector('[data-cat-preview]');
          if (preview) preview.src = `/${cat.image || ''}`;
        }
        markDirty();
        persistDraft();
        card.classList.toggle('is-hidden', Boolean(cat.hidden));
        renderCategoryFilter();
      });
    });

    card.querySelector('[data-upload-cat]')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const path = await uploadFile(file);
        applyImage(path);
        toast('Обложка категории обновлена');
      } catch (err) {
        toast(err.message, true);
      }
    });

    card.querySelector('[data-pick-cat]')?.addEventListener('click', () => {
      const fromCat = collectProductImages({ categoryId: id });
      const images = fromCat.length ? fromCat : collectProductImages();
      openImagePicker({
        title: `Обложка: ${cat.name}`,
        hint: fromCat.length
          ? 'Фото товаров этой категории'
          : 'В категории пока нет фото — показаны все товары',
        images,
        onPick: (src) => {
          applyImage(src);
          toast('Обложка выбрана из фото товаров');
        },
      });
    });
  });
}

/* ---------- Shop ---------- */

const HERO_FALLBACK = 'images/products/flowwow/tort-balerina-1.jpg';

function ensureHero() {
  if (!catalog.shop) catalog.shop = {};
  if (!catalog.shop.hero || typeof catalog.shop.hero !== 'object') {
    catalog.shop.hero = { carousel: true, images: [HERO_FALLBACK] };
  }
  const hero = catalog.shop.hero;
  if (!Array.isArray(hero.images)) hero.images = [];
  if (typeof hero.carousel !== 'boolean') hero.carousel = true;
  return hero;
}

function ensureCarousels() {
  if (!catalog.shop) catalog.shop = {};
  if (!catalog.shop.carousels || typeof catalog.shop.carousels !== 'object') {
    catalog.shop.carousels = { intervalMs: 5500, transitionMs: 1100, products: false };
  }
  const c = catalog.shop.carousels;
  if (!Number(c.intervalMs)) c.intervalMs = 5500;
  if (!Number(c.transitionMs)) c.transitionMs = 1100;
  if (typeof c.products !== 'boolean') c.products = false;
  return c;
}

function fillShopForm() {
  const s = catalog.shop || {};
  $('#shop-name').value = s.name || '';
  $('#shop-tagline').value = s.tagline || '';
  $('#shop-phone').value = s.phone || '';
  $('#shop-email').value = s.email || '';
  $('#shop-address').value = s.address || '';
  $('#shop-city').value = s.city || '';
  $('#shop-hours').value = s.hours || '';
  if ($('#shop-footer-text')) $('#shop-footer-text').value = s.footerText || '';
  if ($('#shop-home-contact-title')) $('#shop-home-contact-title').value = s.homeContactTitle || '';
  if ($('#shop-home-contact-text')) $('#shop-home-contact-text').value = s.homeContactText || '';
  $('#shop-wa').value = s.messengers?.whatsapp?.phone || '';
  $('#shop-tg').value = s.messengers?.telegram?.username || '';
  $('#shop-max').value = s.messengers?.max?.chatUrl || '';
  const hero = ensureHero();
  const carousels = ensureCarousels();
  $('#shop-hero-carousel').checked = Boolean(hero.carousel);
  $('#shop-products-carousel').checked = Boolean(carousels.products);
  $('#shop-carousel-interval').value = (carousels.intervalMs / 1000).toFixed(1);
  $('#shop-carousel-transition').value = (carousels.transitionMs / 1000).toFixed(1);
  renderHeroGallery();
}

function flushShopForm() {
  if (!catalog.shop) catalog.shop = {};
  const s = catalog.shop;
  s.name = $('#shop-name').value.trim();
  s.tagline = $('#shop-tagline').value.trim();
  s.phone = $('#shop-phone').value.trim();
  s.email = $('#shop-email').value.trim();
  s.address = $('#shop-address').value.trim();
  s.city = $('#shop-city').value.trim();
  s.hours = $('#shop-hours').value.trim();
  s.footerText = $('#shop-footer-text')?.value.trim() || '';
  s.homeContactTitle = $('#shop-home-contact-title')?.value.trim() || '';
  s.homeContactText = $('#shop-home-contact-text')?.value.trim() || '';
  if (!s.messengers) s.messengers = {};
  if (!s.messengers.whatsapp) s.messengers.whatsapp = { label: 'WhatsApp' };
  if (!s.messengers.telegram) s.messengers.telegram = { label: 'Telegram' };
  if (!s.messengers.max) s.messengers.max = { label: 'MAX' };
  s.messengers.whatsapp.phone = $('#shop-wa').value.trim();
  s.messengers.telegram.username = $('#shop-tg').value.trim();
  s.messengers.max.chatUrl = $('#shop-max').value.trim();
  const hero = ensureHero();
  const carousels = ensureCarousels();
  hero.carousel = $('#shop-hero-carousel').checked;
  carousels.products = $('#shop-products-carousel').checked;
  const intervalSec = Number($('#shop-carousel-interval').value);
  const transitionSec = Number($('#shop-carousel-transition').value);
  carousels.intervalMs = Math.round(
    Math.min(30, Math.max(1.5, Number.isFinite(intervalSec) ? intervalSec : 5.5)) * 1000
  );
  carousels.transitionMs = Math.round(
    Math.min(5, Math.max(0.2, Number.isFinite(transitionSec) ? transitionSec : 1.1)) * 1000
  );
}

function renderHeroGallery() {
  const box = $('#hero-gallery');
  if (!box) return;
  const hero = ensureHero();
  const images = hero.images;

  if (!images.length) {
    box.innerHTML = `<p class="admin-empty">Нет фото — добавьте с компьютера или из товаров</p>`;
    return;
  }

  box.innerHTML = images
    .map(
      (src, i) => `
    <div class="admin-gallery__item" data-i="${i}">
      <img src="/${src}" alt="">
      <span class="admin-gallery__badge">${i === 0 ? '1 · обложка' : i + 1}</span>
      <div class="admin-gallery__tools">
        <button type="button" data-act="cover" title="Сделать первым">★</button>
        <button type="button" data-act="up" title="Вверх">↑</button>
        <button type="button" data-act="down" title="Вниз">↓</button>
        <button type="button" data-act="pick" title="Заменить из каталога">▦</button>
        <button type="button" data-act="del" title="Удалить">×</button>
      </div>
      <label class="admin-gallery__replace">
        Загрузить файл
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-replace="${i}" hidden>
      </label>
    </div>`
    )
    .join('');

  box.querySelectorAll('.admin-gallery__item').forEach((item) => {
    const i = Number(item.dataset.i);
    item.querySelector('[data-act="cover"]')?.addEventListener('click', () => {
      const [img] = hero.images.splice(i, 1);
      hero.images.unshift(img);
      markDirty();
      renderHeroGallery();
      persistDraft();
    });
    item.querySelector('[data-act="up"]')?.addEventListener('click', () => {
      if (i === 0) return;
      [hero.images[i - 1], hero.images[i]] = [hero.images[i], hero.images[i - 1]];
      markDirty();
      renderHeroGallery();
      persistDraft();
    });
    item.querySelector('[data-act="down"]')?.addEventListener('click', () => {
      if (i >= hero.images.length - 1) return;
      [hero.images[i + 1], hero.images[i]] = [hero.images[i], hero.images[i + 1]];
      markDirty();
      renderHeroGallery();
      persistDraft();
    });
    item.querySelector('[data-act="pick"]')?.addEventListener('click', () => {
      openImagePicker({
        title: `Заменить фото баннера ${i + 1}`,
        hint: 'Выберите фото из каталога товаров',
        images: collectProductImages({ excludePaths: [hero.images[i]].filter(Boolean) }),
        onPick: (src) => {
          hero.images[i] = src;
          markDirty();
          renderHeroGallery();
          persistDraft();
          toast('Фото баннера заменено');
        },
      });
    });
    item.querySelector('[data-act="del"]')?.addEventListener('click', () => {
      hero.images.splice(i, 1);
      markDirty();
      renderHeroGallery();
      persistDraft();
    });
    item.querySelector('[data-replace]')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const path = await uploadFile(file);
        hero.images[i] = path;
        markDirty();
        renderHeroGallery();
        persistDraft();
        toast('Фото баннера заменено');
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
}

function bindShopEvents() {
  $('#shop-editor')?.addEventListener('input', () => {
    flushShopForm();
    markDirty();
    persistDraft();
  });
  $('#shop-editor')?.addEventListener('change', () => {
    flushShopForm();
    markDirty();
    persistDraft();
  });

  $('#hero-upload')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const hero = ensureHero();
    try {
      const path = await uploadFile(file);
      hero.images.push(path);
      markDirty();
      renderHeroGallery();
      persistDraft();
      toast('Фото добавлено на баннер');
    } catch (err) {
      toast(err.message, true);
    }
  });

  $('#hero-pick')?.addEventListener('click', () => {
    const hero = ensureHero();
    openImagePicker({
      title: 'Фото для главного экрана',
      hint: 'Выберите фото из каталога — оно добавится на баннер',
      images: collectProductImages({ excludePaths: hero.images }),
      onPick: (src) => {
        hero.images.push(src);
        markDirty();
        renderHeroGallery();
        persistDraft();
        toast('Фото добавлено на баннер');
      },
    });
  });
}

/* ---------- Save ---------- */

async function saveCatalog() {
  flushEditorToCatalog();
  flushShopForm();
  if (!catalog?.products?.length || !catalog?.categories?.length) {
    toast('Нельзя сохранить пустой каталог', true);
    return;
  }
  const named = catalog.products.filter((p) => p?.name?.trim()).length;
  if (named < catalog.products.length * 0.5) {
    toast('Слишком много товаров без названия — сохранение отменено', true);
    return;
  }
  try {
    const result = await api('/api/admin/catalog', {
      method: 'PUT',
      body: JSON.stringify(catalog),
    });
    markDirty(false);
    clearDraft();
    toast(`Сохранено: ${result.products} товаров`);
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------- Boot ---------- */

async function bootApp() {
  $('#admin-app').classList.remove('hidden');

  const draft = loadDraft();
  let loaded;
  try {
    loaded = await api('/api/admin/catalog');
  } catch (err) {
    toast(err.message, true);
    return;
  }

  let openId = null;
  // Prefer file by default — draft restore is opt-in via banner (confirm is easy to mis-click).
  const sanitized = draft?.catalog ? sanitizeDraftCatalog(structuredClone(draft.catalog), loaded) : null;
  const draftFresh = Boolean(sanitized && draft.at && Date.now() - draft.at < 1000 * 60 * 60 * 12);
  catalog = loaded;
  clearDraft();

  selectedId = null;

  renderCategoryFilter();
  bindEditorEvents();
  bindShopEvents();
  initTabs();
  initImagePicker();
  renderProductList();
  fillShopForm();

  const firstId = catalog.products[0]?.id;
  const idToOpen = openId && getProduct(openId) ? openId : firstId;
  if (idToOpen != null) selectProduct(idToOpen, { skipFlush: true });

  if (draftFresh) {
    const ban = document.createElement('p');
    ban.className = 'admin-banner';
    ban.id = 'admin-draft-banner';
    ban.innerHTML =
      'Есть несохранённый черновик в браузере. ' +
      '<button type="button" class="admin-btn" id="admin-draft-restore">Восстановить черновик</button> ' +
      '<button type="button" class="admin-btn admin-btn--ghost" id="admin-draft-dismiss">Закрыть</button>';
    $('#admin-pin-warn')?.after(ban);
    // Keep draft payload aside for optional restore
    const pendingDraft = { catalog: sanitized.catalog, selectedId: draft.selectedId, repaired: sanitized.repaired };
    $('#admin-draft-restore')?.addEventListener('click', () => {
      catalog = pendingDraft.catalog;
      openId = pendingDraft.selectedId;
      markDirty(true);
      renderCategoryFilter();
      renderProductList();
      fillShopForm();
      const id = openId && getProduct(openId) ? openId : catalog.products[0]?.id;
      if (id != null) selectProduct(id, { skipFlush: true });
      if (pendingDraft.repaired) toast(`Восстановлено ${pendingDraft.repaired} товар(ов) из файла`);
      ban.remove();
    });
    $('#admin-draft-dismiss')?.addEventListener('click', () => ban.remove());
  }

  $('#admin-reload')?.addEventListener('click', () => {
    if (dirty && !window.confirm('Сбросить несохранённые правки и загрузить каталог из файла?')) return;
    clearDraft();
    window.location.reload();
  });
  $('#admin-save').addEventListener('click', saveCatalog);

  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  $('#admin-status').textContent = dirty ? 'есть несохранённые изменения' : 'готово';
}

async function main() {
  const ok = await initAuth();
  if (ok) await bootApp();
}

main();
