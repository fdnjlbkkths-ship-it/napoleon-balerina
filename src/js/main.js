import '../scss/main.scss';
import { initLoader, initScrollAnimations, initHeroParallax, initHeaderScroll } from './animations.js';
import { initCart, initContactForm } from './ui.js';
import { getProducts, getShopInfo } from './data.js';
import { renderCategories, renderReviews, renderProductCards } from './menu.js';
import { initMenuPage } from './menu.js';
import { initProductPage } from './product.js';
import {
  initDropdownLinkClose,
  closeAllDropdowns,
} from './navigation.js';
import { lockBodyScroll, unlockBodyScroll } from './pointer.js';
import { MESSENGER_ICONS, getMessengerList } from './messengers.js';
import { initHero } from './hero.js';

document.body.classList.add('no-scroll');

function initNavigation() {
  const burger = document.getElementById('burger');
  const mobileMenu = document.getElementById('mobile-menu');
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  initDropdownLinkClose();

  document.querySelectorAll('.header__link, .mobile-menu__link').forEach((link) => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  const closeMobileMenu = () => {
    burger?.classList.remove('active');
    mobileMenu?.classList.remove('active');
    burger?.setAttribute('aria-expanded', 'false');
    unlockBodyScroll();
  };

  const openMobileMenu = () => {
    closeAllDropdowns();
    burger?.classList.add('active');
    mobileMenu?.classList.add('active');
    burger?.setAttribute('aria-expanded', 'true');
    lockBodyScroll();
  };

  burger?.setAttribute('aria-expanded', 'false');
  burger?.setAttribute('aria-controls', 'mobile-menu');

  burger?.addEventListener('click', () => {
    if (mobileMenu?.classList.contains('active')) closeMobileMenu();
    else openMobileMenu();
  });

  mobileMenu
    ?.querySelectorAll('.mobile-menu__link, .mobile-menu__sublink')
    .forEach((link) => {
      link.addEventListener('click', () => closeMobileMenu());
    });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileMenu?.classList.contains('active')) {
      closeMobileMenu();
    }
  });

  // Close mobile menu on resize to desktop
  window.matchMedia('(min-width: 768px)').addEventListener('change', (mq) => {
    if (mq.matches) closeMobileMenu();
  });
}

function initShopContent() {
  const shop = getShopInfo() || {};
  const telHref = shop.phone ? `tel:${String(shop.phone).replace(/\D/g, '')}` : '';

  document.querySelectorAll('[data-shop]').forEach((el) => {
    const key = el.getAttribute('data-shop');
    const value = shop[key];
    if (value == null || value === '') return;

    if (key === 'phone' && el.tagName === 'A') {
      el.textContent = value;
      el.href = telHref;
      return;
    }
    if (key === 'email' && el.tagName === 'A') {
      el.textContent = value;
      el.href = `mailto:${value}`;
      return;
    }
    el.textContent = value;
  });

  const contactTitle = document.getElementById('contact-title');
  const contactText = document.getElementById('home-contact-text');
  if (contactTitle && shop.homeContactTitle) contactTitle.textContent = shop.homeContactTitle;
  if (contactText && shop.homeContactText) contactText.textContent = shop.homeContactText;

  const tagline = document.getElementById('hero-tagline');
  if (tagline && !tagline.dataset.locked && shop.tagline) {
    tagline.textContent = shop.tagline;
  }
}

function initHomePage() {
  const categoriesEl = document.getElementById('categories-grid');
  const reviewsEl = document.getElementById('reviews-grid');
  const featuredEl = document.getElementById('featured-grid');

  if (categoriesEl) {
    renderCategories(categoriesEl);
  }
  if (reviewsEl) renderReviews(reviewsEl);
  if (featuredEl) renderProductCards(featuredEl, getProducts().slice(0, 4));
}

function initContactsPage() {
  const shop = getShopInfo();
  const phoneEl = document.getElementById('contact-phone');
  const emailEl = document.getElementById('contact-email');
  const addressEl = document.getElementById('contact-address');
  const hoursEl = document.getElementById('contact-hours');

  if (phoneEl && shop.phone) {
    phoneEl.textContent = shop.phone;
    phoneEl.href = `tel:${shop.phone.replace(/\D/g, '')}`;
  }
  if (emailEl && shop.email) {
    emailEl.textContent = shop.email;
    emailEl.href = `mailto:${shop.email}`;
  }
  if (addressEl && shop.address) addressEl.textContent = shop.address;
  if (hoursEl && shop.hours) hoursEl.textContent = shop.hours;

  const list = document.getElementById('contact-messengers-list');
  if (list) {
    const messengers = getMessengerList('');
    list.innerHTML = messengers
      .map(
        (m) => `
      <a
        href="${m.url}"
        class="contact-messenger contact-messenger--${m.id}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="${m.label}"
        title="${m.label}"
      >
        <span class="contact-messenger__icon">${MESSENGER_ICONS[m.id]}</span>
      </a>`
      )
      .join('');
  }
}

const page = window.location.pathname.split('/').pop() || 'index.html';

initLoader();
initNavigation();
initCart();
initHeaderScroll();
initShopContent();

if (page === 'index.html' || page === '') {
  initHero();
  initHomePage();
  initHeroParallax();
  initContactForm('home-contact-form');
} else if (page === 'menu.html') {
  initMenuPage();
} else if (page === 'product.html') {
  initProductPage();
} else if (page === 'contacts.html') {
  initContactsPage();
  initContactForm('contact-form');
}

window.addEventListener('load', () => {
  if (page !== 'index.html' && page !== '') {
    initScrollAnimations();
  }
});
