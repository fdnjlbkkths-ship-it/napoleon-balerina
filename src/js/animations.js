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
  const hero = document.querySelector('.hero');
  const wrap = document.querySelector('.hero__photo-wrap');
  if (!hero || !wrap) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const photos = () => gsap.utils.toArray('.hero__photo');

  const applyKenBurns = (photo) => {
    if (!photo || reduceMotion) return;
    gsap.killTweensOf(photo);
    gsap.set(photo, { scale: 1.12, xPercent: 0, yPercent: 0, transformOrigin: '60% 35%' });
    gsap.to(photo, {
      scale: 1.22,
      xPercent: -2,
      duration: 18,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  };

  photos().forEach((photo) => {
    if (photo.classList.contains('is-active')) applyKenBurns(photo);
    else gsap.set(photo, { scale: 1.12, transformOrigin: '60% 35%' });
  });

  if (!reduceMotion) {
    gsap.to(wrap, {
      yPercent: 12,
      ease: 'none',
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
    });
  }

  window.addEventListener('hero-slide-change', (e) => {
    const next = photos()[e.detail?.index];
    photos().forEach((photo) => gsap.killTweensOf(photo));
    applyKenBurns(next);
  });

  const pieces = gsap.utils.toArray('[data-hero-animate]');
  if (pieces.length) {
    gsap.set(pieces, { opacity: 0, y: 36 });
    gsap.to(pieces, {
      opacity: 1,
      y: 0,
      duration: 1.05,
      stagger: 0.14,
      ease: 'power3.out',
      delay: 0.35,
    });
  }

  const shimmer = document.querySelector('.hero__shimmer');
  if (shimmer && !reduceMotion) {
    gsap.fromTo(
      shimmer,
      { xPercent: -120, opacity: 0 },
      {
        xPercent: 120,
        opacity: 0.55,
        duration: 3.2,
        ease: 'power1.inOut',
        repeat: -1,
        repeatDelay: 4,
      }
    );
  }
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
