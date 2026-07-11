import { getCategories, getSubcategories } from './data.js';
import { canHoverFine } from './pointer.js';

function menuUrl(category, subcategory = null) {
  const base = `menu.html?category=${category}`;
  return subcategory ? `${base}&subcategory=${subcategory}` : base;
}

function buildDropdownItems(category) {
  const subs = getSubcategories(category.id);
  if (!subs.length) {
    return '';
  }

  return subs
    .map(
      (sub) =>
        `<li><a href="${menuUrl(category.id, sub.id)}">${sub.icon ? sub.icon + ' ' : ''}${sub.name}</a></li>`
    )
    .join('');
}

export function renderNavDropdowns(container) {
  if (!container) return;

  const categories = getCategories();

  container.innerHTML = categories
    .map((cat) => {
      const subs = getSubcategories(cat.id);
      const hasSubs = subs.length > 0;

      if (!hasSubs) {
        return `
    <div class="nav-dropdown nav-dropdown--simple">
      <a href="${menuUrl(cat.id)}" class="nav-dropdown__trigger header__link">
        ${cat.icon} ${cat.name}
      </a>
    </div>`;
      }

      return `
    <div class="nav-dropdown">
      <a href="${menuUrl(cat.id)}" class="nav-dropdown__trigger header__link" aria-expanded="false" aria-haspopup="true">
        ${cat.icon} ${cat.name}
        <span class="nav-dropdown__arrow" aria-hidden="true">▾</span>
      </a>
      <ul class="nav-dropdown__menu">
        <li><a href="${menuUrl(cat.id)}">Все — ${cat.name}</a></li>
        ${buildDropdownItems(cat)}
      </ul>
    </div>`;
    })
    .join('');
}

export function renderMobileCatalog(container) {
  if (!container) return;

  const categories = getCategories();

  container.innerHTML = categories
    .map((cat) => {
      const subs = getSubcategories(cat.id);
      if (!subs.length) {
        return `<li><a href="${menuUrl(cat.id)}" class="mobile-menu__link">${cat.icon} ${cat.name}</a></li>`;
      }

      return `
      <li class="mobile-menu__group">
        <span class="mobile-menu__group-title">${cat.icon} ${cat.name}</span>
        <ul class="mobile-menu__sublist">
          <li><a href="${menuUrl(cat.id)}" class="mobile-menu__sublink">Все</a></li>
          ${subs
            .map(
              (sub) =>
                `<li><a href="${menuUrl(cat.id, sub.id)}" class="mobile-menu__sublink">${sub.name}</a></li>`
            )
            .join('')}
        </ul>
      </li>`;
    })
    .join('');
}

export function closeAllDropdowns() {
  document
    .querySelectorAll(
      '.nav-dropdown.open, .filter-dropdown.open, .category-card-wrap.open, .filling-dropdown.open, .toolbar-dropdown.open'
    )
    .forEach((el) => {
      el.classList.remove('open');
      el.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
    });
}

export function initDropdownLinkClose() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest(
      '.nav-dropdown__menu a, .filter-dropdown__menu a, .category-card__menu a'
    );
    if (!link) return;

    e.preventDefault();
    const href = link.getAttribute('href');
    closeAllDropdowns();
    if (href) window.location.assign(href);
  });
}

function bindHoverOpen(el, { onOpen, onClose } = {}) {
  if (!canHoverFine()) return;
  let timer;
  el.addEventListener('mouseenter', () => {
    clearTimeout(timer);
    onOpen?.();
  });
  el.addEventListener('mouseleave', () => {
    timer = setTimeout(() => onClose?.(), 120);
  });
}

export function initNavDropdowns() {
  document.querySelectorAll('.nav-dropdown').forEach((dropdown) => {
    if (dropdown.classList.contains('nav-dropdown--simple')) return;
    if (dropdown.dataset.bound) return;
    dropdown.dataset.bound = '1';

    const trigger = dropdown.querySelector('.nav-dropdown__trigger');

    const open = () => {
      closeAllDropdowns();
      dropdown.classList.add('open');
      trigger?.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
      dropdown.classList.remove('open');
      trigger?.setAttribute('aria-expanded', 'false');
    };

    trigger?.addEventListener('click', (e) => {
      if (canHoverFine()) return; // desktop: follow link / hover opens
      e.preventDefault();
      if (dropdown.classList.contains('open')) close();
      else open();
    });

    bindHoverOpen(dropdown, { onOpen: open, onClose: close });

    dropdown.addEventListener('focusin', open);
    dropdown.addEventListener('focusout', (e) => {
      if (!dropdown.contains(e.relatedTarget)) close();
    });
  });
}

export function initCategoryCardDropdowns(container) {
  if (!container) return;

  container.querySelectorAll('.category-card-wrap').forEach((wrap) => {
    if (wrap.dataset.bound) return;
    wrap.dataset.bound = '1';

    const open = () => {
      closeAllDropdowns();
      wrap.classList.add('open');
    };
    const close = () => wrap.classList.remove('open');

    bindHoverOpen(wrap, { onOpen: open, onClose: close });
  });
}

// Ensure outside click closes dropdowns once
if (typeof document !== 'undefined' && !document.documentElement.dataset.dropdownOutsideBound) {
  document.documentElement.dataset.dropdownOutsideBound = '1';
  document.addEventListener('click', (e) => {
    if (
      e.target.closest(
        '.nav-dropdown, .filter-dropdown, .filling-dropdown, .toolbar-dropdown, .category-card-wrap'
      )
    ) {
      return;
    }
    closeAllDropdowns();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllDropdowns();
  });
}
