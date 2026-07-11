import {
  getDefaultDelivery,
  getDeliveryHint,
  getEarliestDelivery,
  getTimeSlotsForDate,
  isDateAvailable,
  formatDisplayDate,
  toIsoDate,
  parseIsoDate,
} from './delivery-slots.js';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

/**
 * Стильный календарь + слоты времени с учётом 12ч готовки и графика 9–21
 */
export function initDeliveryPickers(container, { onChange } = {}) {
  if (!container) return { getValues: () => ({ date: '', time: '' }) };

  const defaults = getDefaultDelivery();
  let selectedDate = defaults.date;
  let selectedTime = defaults.time;
  let viewMonth = parseIsoDate(selectedDate);
  viewMonth.setDate(1);

  const dateTrigger = container.querySelector('[data-date-trigger]');
  const timeTrigger = container.querySelector('[data-time-trigger]');
  const datePanel = container.querySelector('[data-date-panel]');
  const timePanel = container.querySelector('[data-time-panel]');
  const dateValue = container.querySelector('[data-date-value]');
  const timeValue = container.querySelector('[data-time-value]');
  const hintEl = container.querySelector('[data-delivery-hint]');
  const hiddenDate = container.querySelector('#checkout-date');
  const hiddenTime = container.querySelector('#checkout-time');

  function syncHidden() {
    if (hiddenDate) hiddenDate.value = selectedDate;
    if (hiddenTime) hiddenTime.value = selectedTime;
    if (dateValue) dateValue.textContent = formatDisplayDate(selectedDate);
    if (timeValue) timeValue.textContent = selectedTime || 'Выберите время';
    if (hintEl) hintEl.textContent = getDeliveryHint();
    onChange?.({ date: selectedDate, time: selectedTime });
  }

  function closePanels() {
    datePanel?.classList.remove('open');
    timePanel?.classList.remove('open');
    dateTrigger?.setAttribute('aria-expanded', 'false');
    timeTrigger?.setAttribute('aria-expanded', 'false');
  }

  function renderCalendar() {
    if (!datePanel) return;
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    let startWeekday = firstDay.getDay(); // 0=Sun
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1; // Mon-first

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const earliest = getEarliestDelivery();

    let html = `
      <div class="picker-cal__head">
        <button type="button" class="picker-cal__nav" data-cal-prev aria-label="Предыдущий месяц">‹</button>
        <div class="picker-cal__title">${MONTHS[month]} ${year}</div>
        <button type="button" class="picker-cal__nav" data-cal-next aria-label="Следующий месяц">›</button>
      </div>
      <div class="picker-cal__weekdays">${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="picker-cal__grid">`;

    for (let i = 0; i < startWeekday; i++) {
      html += '<span class="picker-cal__day is-empty"></span>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = toIsoDate(new Date(year, month, day));
      const available = isDateAvailable(iso);
      const isSelected = iso === selectedDate;
      const isToday = iso === toIsoDate(new Date());
      const classes = [
        'picker-cal__day',
        available ? '' : 'is-disabled',
        isSelected ? 'is-selected' : '',
        isToday ? 'is-today' : '',
      ]
        .filter(Boolean)
        .join(' ');

      html += `<button type="button" class="${classes}" data-day="${iso}" ${available ? '' : 'disabled'}>${day}</button>`;
    }

    html += '</div>';
    datePanel.innerHTML = html;

    datePanel.querySelector('[data-cal-prev]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      viewMonth.setMonth(viewMonth.getMonth() - 1);
      renderCalendar();
    });
    datePanel.querySelector('[data-cal-next]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      viewMonth.setMonth(viewMonth.getMonth() + 1);
      renderCalendar();
    });

    datePanel.querySelectorAll('[data-day]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedDate = btn.dataset.day;
        const slots = getTimeSlotsForDate(selectedDate);
        if (!slots.includes(selectedTime)) {
          selectedTime = slots[0] || '';
        }
        syncHidden();
        renderCalendar();
        renderTimeSlots();
        closePanels();
      });
    });

    // Don't allow going before earliest month
    const prevBtn = datePanel.querySelector('[data-cal-prev]');
    const minMonth = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    if (prevBtn && viewMonth.getTime() <= minMonth.getTime()) {
      prevBtn.disabled = true;
    }
  }

  function renderTimeSlots() {
    if (!timePanel) return;
    const slots = getTimeSlotsForDate(selectedDate);

    if (!slots.length) {
      timePanel.innerHTML = '<p class="picker-time__empty">На эту дату нет свободных слотов</p>';
      return;
    }

    timePanel.innerHTML = `
      <div class="picker-time__grid">
        ${slots
          .map(
            (slot) => `
          <button type="button" class="picker-time__slot ${slot === selectedTime ? 'is-selected' : ''}" data-time="${slot}">
            ${slot}
          </button>`
          )
          .join('')}
      </div>`;

    timePanel.querySelectorAll('[data-time]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedTime = btn.dataset.time;
        syncHidden();
        renderTimeSlots();
        closePanels();
      });
    });
  }

  dateTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !datePanel.classList.contains('open');
    closePanels();
    if (willOpen) {
      datePanel.classList.add('open');
      dateTrigger.setAttribute('aria-expanded', 'true');
      renderCalendar();
    }
  });

  timeTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !timePanel.classList.contains('open');
    closePanels();
    if (willOpen) {
      timePanel.classList.add('open');
      timeTrigger.setAttribute('aria-expanded', 'true');
      renderTimeSlots();
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) closePanels();
  });

  syncHidden();
  renderCalendar();
  renderTimeSlots();

  return {
    getValues: () => ({ date: selectedDate, time: selectedTime }),
  };
}

export function renderDeliveryPickersHtml() {
  const defaults = getDefaultDelivery();
  return `
    <div class="delivery-pickers" id="delivery-pickers">
      <p class="field-hint" data-delivery-hint></p>
      <div class="checkout-datetime">
        <div class="checkout-datetime__col">
          <label>Дата доставки</label>
          <div class="picker-field">
            <button type="button" class="picker-field__trigger" data-date-trigger aria-expanded="false">
              <span class="picker-field__icon" aria-hidden="true">📅</span>
              <span data-date-value>${formatDisplayDate(defaults.date)}</span>
              <span class="picker-field__chevron" aria-hidden="true">▾</span>
            </button>
            <div class="picker-cal" data-date-panel></div>
            <input type="hidden" id="checkout-date" value="${defaults.date}">
          </div>
        </div>
        <div class="checkout-datetime__col">
          <label>Время доставки</label>
          <div class="picker-field">
            <button type="button" class="picker-field__trigger" data-time-trigger aria-expanded="false">
              <span class="picker-field__icon" aria-hidden="true">🕒</span>
              <span data-time-value>${defaults.time}</span>
              <span class="picker-field__chevron" aria-hidden="true">▾</span>
            </button>
            <div class="picker-time" data-time-panel></div>
            <input type="hidden" id="checkout-time" value="${defaults.time}">
          </div>
        </div>
      </div>
    </div>`;
}
