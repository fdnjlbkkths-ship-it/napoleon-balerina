/**
 * Короткий формат размера: «Ш - 16 см; В - 10 см»
 */

export function formatSizeDisplay(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  return text
    .replace(/Ширина\s*[-–—:]?\s*/gi, 'Ш - ')
    .replace(/Высота\s*[-–—:]?\s*/gi, 'В - ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
