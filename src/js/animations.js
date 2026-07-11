import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function initLoader() {
  const loader = document.getElementById('loader');
  if (!loader) return;

  window.addEventListener('load', () => {
    setTimeout(() => {
      loader.classList.add('hidden');
      document.body.classList.remove('no-scroll');
      initScrollAnimations();
    }, 600);
  });
}

export function animateElements(selector = '[data-animate]') {
  gsap.utils.toArray(selector).forEach((el) => {
    if (el.dataset.animated) return;
    el.dataset.animated = 'true';
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        toggleActions: 'play none none none',
      },
    });
  });
}

export function initScrollAnimations() {
  animateElements('[data-animate]');
}

export function initHeroParallax() {
  const heroBg = document.querySelector('.hero__bg img');
  if (!heroBg) return;

  gsap.to(heroBg, {
    yPercent: 20,
    ease: 'none',
    scrollTrigger: {
      trigger: '.hero',
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    },
  });
}

export function initHeaderScroll() {
  const header = document.querySelector('.header');
  if (!header) return;

  ScrollTrigger.create({
    start: 'top -80',
    onUpdate: (self) => {
      header.classList.toggle('scrolled', self.scroll() > 50);
    },
  });
}

export function animateCartBadge(countEl) {
  if (!countEl) return;
  gsap.fromTo(countEl, { scale: 1.4 }, { scale: 1, duration: 0.3, ease: 'back.out(2)' });
}
