import { getCarouselSettings, getShopInfo } from './data.js';

const HERO_FALLBACK = 'images/products/flowwow/tort-balerina-1.jpg';

function getHeroConfig() {
  const shop = getShopInfo() || {};
  const hero = shop.hero || {};
  const settings = getCarouselSettings();
  const images = Array.isArray(hero.images) ? hero.images.filter(Boolean) : [];
  return {
    carousel: settings.hero,
    intervalMs: settings.intervalMs,
    transitionMs: settings.transitionMs,
    images: images.length ? images : [HERO_FALLBACK],
  };
}

export function initHero() {
  const stage = document.querySelector('.hero__photo-wrap');
  const dotsHost = document.getElementById('hero-dots');
  if (!stage) return;

  const { carousel, intervalMs, transitionMs, images } = getHeroConfig();
  const useCarousel = carousel && images.length > 1;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  stage.style.setProperty('--hero-fade-ms', `${transitionMs}ms`);

  stage.innerHTML = images
    .map(
      (src, i) => `
    <img
      class="hero__photo${i === 0 ? ' is-active' : ''}"
      src="${src}"
      alt=""
      width="1600"
      height="2000"
      ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}
      data-hero-slide="${i}"
    >`
    )
    .join('');

  if (dotsHost) {
    if (useCarousel) {
      dotsHost.hidden = false;
      dotsHost.innerHTML = images
        .map(
          (_, i) =>
            `<button type="button" class="hero__dot${i === 0 ? ' is-active' : ''}" data-hero-dot="${i}" aria-label="Фото ${i + 1}"></button>`
        )
        .join('');
    } else {
      dotsHost.hidden = true;
      dotsHost.innerHTML = '';
    }
  }

  if (!useCarousel || reduceMotion) return;

  let index = 0;
  let timer = null;
  const slides = [...stage.querySelectorAll('.hero__photo')];
  const dots = dotsHost ? [...dotsHost.querySelectorAll('[data-hero-dot]')] : [];

  const show = (next) => {
    if (next === index) return;
    slides[index]?.classList.remove('is-active');
    dots[index]?.classList.remove('is-active');
    index = (next + slides.length) % slides.length;
    slides[index]?.classList.add('is-active');
    dots[index]?.classList.add('is-active');
    window.dispatchEvent(new CustomEvent('hero-slide-change', { detail: { index } }));
  };

  const start = () => {
    stop();
    timer = window.setInterval(() => show(index + 1), intervalMs);
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      show(Number(dot.dataset.heroDot));
      start();
    });
  });

  const hero = document.querySelector('.hero');
  hero?.addEventListener('mouseenter', stop);
  hero?.addEventListener('mouseleave', start);

  start();
}
