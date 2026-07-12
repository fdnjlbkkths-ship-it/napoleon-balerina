import { canHoverFine } from './pointer.js';

/** Доплата за начинку «Малина» (и варианты с малиной), ₽ */
export const RASPBERRY_FILLING_EXTRA = 400;

export function getFillingExtra(filling) {
  if (!filling) return 0;
  return /малин/i.test(String(filling)) ? RASPBERRY_FILLING_EXTRA : 0;
}

export function getPriceWithFilling(basePrice, filling) {
  return Number(basePrice) + getFillingExtra(filling);
}

export function formatFillingOptionLabel(filling) {
  const extra = getFillingExtra(filling);
  return `${filling} (+${extra} ₽)`;
}

export function formatFillingExtraLabel(filling) {
  return `+${getFillingExtra(filling)} ₽`;
}

import { escapeHtml } from './sanitize.js';

export { escapeHtml };

/**
 * Выпадающее окошко начинок — анимация как у категорий / фильтров.
 */
export function renderFillingDropdown(productId, fillings, selected = fillings[0] || '') {
  if (!fillings?.length) return '';

  if (fillings.length === 1) {
    return `<p class="product-card__filling-hint" data-filling-value="${escapeHtml(fillings[0])}">
      Начинка: ${escapeHtml(fillings[0])} <span class="filling-extra">${formatFillingExtraLabel(fillings[0])}</span>
    </p>`;
  }

  const current = selected || fillings[0];
  return `
    <div class="filling-dropdown" data-filling-dropdown data-product-id="${productId}">
      <button type="button" class="filling-dropdown__trigger" aria-expanded="false" aria-haspopup="listbox">
        <span class="filling-dropdown__label">Начинка</span>
        <span class="filling-dropdown__value" data-filling-value>${escapeHtml(formatFillingOptionLabel(current))}</span>
        <span class="filling-dropdown__arrow" aria-hidden="true">▾</span>
      </button>
      <ul class="filling-dropdown__menu" role="listbox">
        ${fillings
          .map((f) => {
            return `<li>
              <button type="button" class="filling-dropdown__option${f === current ? ' is-active' : ''}"
                role="option" data-filling="${escapeHtml(f)}" aria-selected="${f === current}">
                <span>${escapeHtml(f)}</span>
                <span class="filling-extra">${formatFillingExtraLabel(f)}</span>
              </button>
            </li>`;
          })
          .join('')}
      </ul>
    </div>`;
}

export function getSelectedFilling(root, productId, fillings) {
  if (!fillings?.length) return '';
  if (fillings.length === 1) return fillings[0];

  const dropdown = root?.querySelector(`[data-filling-dropdown][data-product-id="${productId}"]`);
  const active = dropdown?.querySelector('.filling-dropdown__option.is-active');
  return active?.dataset.filling || fillings[0] || '';
}

export function initFillingDropdowns(container, { onChange } = {}) {
  if (!container) return;

  if (!document.documentElement.dataset.fillingOutsideBound) {
    document.documentElement.dataset.fillingOutsideBound = '1';
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-filling-dropdown]')) return;
      document.querySelectorAll('.filling-dropdown.open').forEach((el) => {
        el.classList.remove('open');
        el.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
      });
    });
  }

  container.querySelectorAll('[data-filling-dropdown]').forEach((dropdown) => {
    if (dropdown.dataset.bound) return;
    dropdown.dataset.bound = '1';

    let closeTimer;
    const trigger = dropdown.querySelector('.filling-dropdown__trigger');
    const valueEl = dropdown.querySelector('[data-filling-value]');

    const open = () => {
      clearTimeout(closeTimer);
      document
        .querySelectorAll(
          '.filling-dropdown.open, .nav-dropdown.open, .filter-dropdown.open, .category-card-wrap.open, .toolbar-dropdown.open'
        )
        .forEach((el) => {
          if (el !== dropdown) {
            el.classList.remove('open');
            el.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
          }
        });
      dropdown.classList.add('open');
      trigger?.setAttribute('aria-expanded', 'true');
    };

    const close = () => {
      dropdown.classList.remove('open');
      trigger?.setAttribute('aria-expanded', 'false');
    };

    trigger?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropdown.classList.contains('open')) close();
      else open();
    });

    if (canHoverFine()) {
      dropdown.addEventListener('mouseenter', open);
      dropdown.addEventListener('mouseleave', () => {
        closeTimer = setTimeout(close, 120);
      });
    }

    dropdown.querySelectorAll('.filling-dropdown__option').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const filling = opt.dataset.filling || '';
        dropdown.querySelectorAll('.filling-dropdown__option').forEach((o) => {
          o.classList.toggle('is-active', o === opt);
          o.setAttribute('aria-selected', o === opt ? 'true' : 'false');
        });
        if (valueEl) valueEl.textContent = formatFillingOptionLabel(filling);
        close();
        onChange?.(dropdown, filling);
      });
    });
  });
}
