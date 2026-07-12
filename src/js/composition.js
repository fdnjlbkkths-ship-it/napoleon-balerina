/**
 * Разбор строки состава в список ингредиентов (по одному на строку).
 */

export function formatCompositionLines(raw) {
  let text = String(raw || '').trim();
  if (!text) return [];

  text = text
    .replace(/^(Общий\s+)?Состав\s*:?\s*/i, '')
    .replace(/\n*(Размер|Вес|Срок(?:\s+изготовления)?|Изготовление|Хранение)\s*:[\s\S]*$/i, '')
    .trim();

  if (!text) return [];

  let lines;
  if (/[•∙·]/.test(text)) {
    lines = text.split(/[•∙·]/);
  } else if (/;/.test(text) && text.split(';').length >= 3) {
    lines = text.split(';');
  } else if (/,/.test(text) && text.split(',').length >= 3) {
    lines = text.split(',');
  } else if (/\n/.test(text)) {
    lines = text.split(/\n/);
  } else {
    // «Яйца куриные Сахар Ваниль» — слова с заглавной как границы
    lines = text.split(/(?<=[а-яёa-z%)])\s+(?=[А-ЯЁA-Z])/);
  }

  return lines
    .map((l) =>
      l
        .replace(/^[•\-*–—]\s*/, '')
        .replace(/^[,;\s]+|[,;\s]+$/g, '')
        .replace(/^(Общий\s+состав|Состав)\s*:?\s*/i, '')
        .trim(),
    )
    .filter(Boolean)
    .filter((l) => !/^(Размер|Вес|Срок|Изготовление|Хранение)\b/i.test(l));
}

/** Достаёт состав из product.composition или из текста описания. */
export function getProductCompositionLines(product) {
  const fromField = formatCompositionLines(product?.composition || '');
  if (fromField.length) return fromField;

  const full = String(product?.fullDescription || product?.description || '');
  if (/Состав\s*:/i.test(full)) {
    const parts = full.split(/\n*Состав\s*:\s*\n?/i);
    return formatCompositionLines(parts.slice(1).join('\n'));
  }

  return [];
}
