import streets from '../data/cheboksary-streets.json';

const DEFAULT_CITY = 'Чебоксары';

function normalize(str) {
  return str.toLowerCase().replace(/ё/g, 'e').trim();
}

function searchStreets(query, limit = 8) {
  const q = normalize(query);
  if (q.length < 2) return [];

  return streets
    .filter((street) => normalize(street).includes(q))
    .slice(0, limit);
}

export function initAddressAutocomplete(container) {
  if (!container) return;

  const cityInput = container.querySelector('[data-address-city]');
  const streetInput = container.querySelector('[data-address-street]');
  const houseInput = container.querySelector('[data-address-house]');
  const entranceInput = container.querySelector('[data-address-entrance]');
  const apartmentInput = container.querySelector('[data-address-apartment]');
  const list = container.querySelector('[data-address-suggestions]');

  if (cityInput && !cityInput.value) {
    cityInput.value = DEFAULT_CITY;
  }

  if (!streetInput || !list) return;

  let activeIndex = -1;

  function hideList() {
    list.innerHTML = '';
    list.classList.remove('active');
    activeIndex = -1;
  }

  function selectStreet(street) {
    streetInput.value = street;
    hideList();
    houseInput?.focus();
    container.dispatchEvent(new CustomEvent('address-change'));
  }

  function renderSuggestions(items) {
    if (!items.length) {
      hideList();
      return;
    }

    list.innerHTML = items
      .map(
        (street, i) => `
      <li>
        <button type="button" class="autocomplete__item ${i === activeIndex ? 'active' : ''}" data-street="${street}">
          <span class="autocomplete__city">${DEFAULT_CITY}</span>, ${street}
        </button>
      </li>`
      )
      .join('');

    list.classList.add('active');

    list.querySelectorAll('[data-street]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectStreet(btn.dataset.street);
      });
    });
  }

  streetInput.addEventListener('input', () => {
    renderSuggestions(searchStreets(streetInput.value));
    container.dispatchEvent(new CustomEvent('address-change'));
  });

  streetInput.addEventListener('keydown', (e) => {
    const items = list.querySelectorAll('[data-street]');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      renderSuggestions(searchStreets(streetInput.value));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderSuggestions(searchStreets(streetInput.value));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      selectStreet(items[activeIndex].dataset.street);
    } else if (e.key === 'Escape') {
      hideList();
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) hideList();
  });

  houseInput?.addEventListener('input', () => {
    container.dispatchEvent(new CustomEvent('address-change'));
  });
  entranceInput?.addEventListener('input', () => {
    container.dispatchEvent(new CustomEvent('address-change'));
  });
  apartmentInput?.addEventListener('input', () => {
    container.dispatchEvent(new CustomEvent('address-change'));
  });
}

export function getAddressValue(container) {
  if (!container) return '';

  const city = container.querySelector('[data-address-city]')?.value?.trim() || DEFAULT_CITY;
  const street = container.querySelector('[data-address-street]')?.value?.trim() || '';
  const house = container.querySelector('[data-address-house]')?.value?.trim() || '';
  const entrance = container.querySelector('[data-address-entrance]')?.value?.trim() || '';
  const apartment = container.querySelector('[data-address-apartment]')?.value?.trim() || '';

  const parts = [city];
  if (street) parts.push(`ул. ${street}`);
  if (house) parts.push(`д. ${house}`);
  if (entrance) parts.push(`подъезд ${entrance}`);
  if (apartment) parts.push(`кв. ${apartment}`);

  return parts.join(', ');
}

export { DEFAULT_CITY };
