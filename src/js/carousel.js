import { getCarouselSettings } from './data.js';

export function getProductImages(product) {
  if (!product) return [];
  if (Array.isArray(product.images) && product.images.length) return product.images;
  if (product.image) return [product.image];
  return [];
}

export function getProductCover(product) {
  return getProductImages(product)[0] || '';
}

export function initCarousel(root) {
  if (!root) return;

  const track = root.querySelector('[data-carousel-track]');
  const dots = root.querySelector('[data-carousel-dots]');
  const prevBtn = root.querySelector('[data-carousel-prev]');
  const nextBtn = root.querySelector('[data-carousel-next]');
  const slides = track ? Array.from(track.children) : [];

  if (!track || slides.length === 0) return;

  const settings = getCarouselSettings();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const autoplay = settings.products && slides.length > 1 && !reduceMotion;

  track.style.transitionDuration = `${Math.min(settings.transitionMs, 1200)}ms`;

  let index = 0;
  const total = slides.length;
  let timer = null;

  function goTo(i) {
    index = (i + total) % total;
    track.style.transform = `translateX(-${index * 100}%)`;
    if (dots) {
      dots.querySelectorAll('button').forEach((btn, n) => {
        btn.classList.toggle('active', n === index);
        btn.setAttribute('aria-current', n === index ? 'true' : 'false');
      });
    }
  }

  function startAutoplay() {
    stopAutoplay();
    if (!autoplay) return;
    timer = window.setInterval(() => goTo(index + 1), settings.intervalMs);
  }

  function stopAutoplay() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  if (dots) {
    dots.innerHTML = slides
      .map(
        (_, i) =>
          `<button type="button" class="${i === 0 ? 'active' : ''}" aria-label="Фото ${i + 1}" aria-current="${i === 0}"></button>`
      )
      .join('');

    dots.querySelectorAll('button').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        goTo(i);
        startAutoplay();
      });
    });
  }

  prevBtn?.addEventListener('click', () => {
    goTo(index - 1);
    startAutoplay();
  });
  nextBtn?.addEventListener('click', () => {
    goTo(index + 1);
    startAutoplay();
  });

  if (total <= 1) {
    prevBtn?.classList.add('hidden');
    nextBtn?.classList.add('hidden');
    dots?.classList.add('hidden');
  }

  let startX = 0;
  track.addEventListener(
    'touchstart',
    (e) => {
      startX = e.touches[0].clientX;
      stopAutoplay();
    },
    { passive: true }
  );
  track.addEventListener(
    'touchend',
    (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) goTo(dx < 0 ? index + 1 : index - 1);
      startAutoplay();
    },
    { passive: true }
  );

  root.addEventListener('mouseenter', stopAutoplay);
  root.addEventListener('mouseleave', startAutoplay);

  goTo(0);
  startAutoplay();
}

export function renderCarousel(images, alt = '') {
  if (!images.length) {
    return `<div class="carousel carousel--empty"><p>Фото скоро появится</p></div>`;
  }

  return `
    <div class="carousel" data-carousel>
      <div class="carousel__viewport">
        <div class="carousel__track" data-carousel-track>
          ${images
            .map(
              (src) => `
            <div class="carousel__slide">
              <img src="${src}" alt="${alt}" loading="lazy" width="800" height="600">
            </div>`
            )
            .join('')}
        </div>
        <button type="button" class="carousel__nav carousel__nav--prev" data-carousel-prev aria-label="Предыдущее фото">‹</button>
        <button type="button" class="carousel__nav carousel__nav--next" data-carousel-next aria-label="Следующее фото">›</button>
      </div>
      <div class="carousel__dots" data-carousel-dots></div>
    </div>`;
}
