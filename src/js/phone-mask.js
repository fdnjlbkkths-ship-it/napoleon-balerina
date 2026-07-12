/**
 * Маска: сразу +7 (9… затем остальные цифры номера
 * Итог: +7 (9XX) XXX-XX-XX
 */

export function normalizePhoneDigits(input) {
  let digits = String(input).replace(/\D/g, '');

  if (!digits) return '79';

  if (digits.startsWith('8')) {
    digits = '7' + digits.slice(1);
  }

  if (digits.startsWith('7')) {
    // keep
  } else if (digits.startsWith('9')) {
    digits = '7' + digits;
  } else {
    digits = '79' + digits;
  }

  // После 7 всегда должна быть 9 (мобильный)
  if (digits.length === 1) {
    digits = '79';
  } else if (digits[1] !== '9') {
    digits = '79' + digits.slice(1).replace(/^9*/, '');
  }

  return digits.slice(0, 11);
}

export function formatRuPhone(digits) {
  const d = normalizePhoneDigits(digits);
  const local = d.slice(1); // начинается с 9…
  let result = '+7';

  if (local.length === 0) return '+7 (9';

  result += ' (' + local.slice(0, Math.min(3, local.length));

  if (local.length <= 3) return result;

  result += ') ' + local.slice(3, 6);

  if (local.length <= 6) return result;

  result += '-' + local.slice(6, 8);

  if (local.length <= 8) return result;

  result += '-' + local.slice(8, 10);

  return result;
}

function syncPhoneInput(input) {
  const digits = normalizePhoneDigits(input.value || '');
  input.dataset.rawPhone = digits;
  input.value = digits.length <= 2 ? '+7 (9' : formatRuPhone(digits);
  return digits;
}

export function initPhoneMask(input) {
  if (!input) return;

  const PREFIX = '+7 (9';

  if (!input.value.trim()) {
    input.value = PREFIX;
    input.dataset.rawPhone = '79';
  } else {
    syncPhoneInput(input);
  }

  input.addEventListener('focus', () => {
    if (!input.value.trim() || input.value === '+7' || input.value === '+7 (') {
      input.value = PREFIX;
      input.dataset.rawPhone = '79';
    }
    // Курсор в конец
    requestAnimationFrame(() => {
      const len = input.value.length;
      input.setSelectionRange(len, len);
    });
  });

  input.addEventListener('input', () => {
    const digits = normalizePhoneDigits(input.value);
    input.value = formatRuPhone(digits);
    input.dataset.rawPhone = digits;
    const len = input.value.length;
    input.setSelectionRange(len, len);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Backspace') return;

    const digits = normalizePhoneDigits(input.value);
    // Не даём стереть префикс +7 (9
    if (digits.length <= 2) {
      e.preventDefault();
      input.value = PREFIX;
      input.dataset.rawPhone = '79';
    }
  });

  input.addEventListener('blur', () => {
    const digits = normalizePhoneDigits(input.value);
    if (digits.length <= 2) {
      input.value = PREFIX;
      input.dataset.rawPhone = '79';
    } else {
      input.dataset.rawPhone = digits;
      input.value = formatRuPhone(digits);
    }
  });

  // Автозаполнение браузера может не вызвать input
  input.addEventListener('change', () => {
    syncPhoneInput(input);
  });
}

export function getPhoneValue(input) {
  if (!input) return '';
  const digits = normalizePhoneDigits(input.value || '');
  if (digits.length <= 2) return '';
  input.dataset.rawPhone = digits;
  return formatRuPhone(digits);
}

export function isPhoneComplete(input) {
  if (!input) return false;
  const digits = normalizePhoneDigits(input.value || '');
  if (digits.length === 11) {
    input.dataset.rawPhone = digits;
    return true;
  }
  return false;
}
