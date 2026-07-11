/** Pointer / hover capability helpers for touch-friendly UI */

export function canHoverFine() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function isNarrowViewport() {
  return window.matchMedia(`(max-width: 767px)`).matches;
}

let lockedScrollY = 0;

export function lockBodyScroll() {
  if (document.body.dataset.scrollLocked === '1') return;
  lockedScrollY = window.scrollY || window.pageYOffset || 0;
  document.body.dataset.scrollLocked = '1';
  document.body.classList.add('no-scroll');
  document.body.style.position = 'fixed';
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}

export function unlockBodyScroll() {
  if (document.body.dataset.scrollLocked !== '1') return;
  document.body.dataset.scrollLocked = '0';
  document.body.classList.remove('no-scroll');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, lockedScrollY);
}
