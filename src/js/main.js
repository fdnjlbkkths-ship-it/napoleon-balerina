import '../scss/main.scss';
import { initLoader, initScrollAnimations, initHeroParallax, initHeaderScroll } from './animations.js';
import { initCart, initContactForm } from './ui.js';
import { getProducts, getShopInfo } from './data.js';
import { renderCategories, renderReviews, renderProductCards } from './menu.js';
import { initMenuPage } from './menu.js';

document.body.classList.add('no-scroll');

function initNavigation() {
  const burger = document.getElementById('burger');
  const mobileMenu = document.getElementById('mobile-menu');
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  document.querySelectorAll('.header__link, .mobile-menu__link').forEach((link) => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  burger?.addEventListener('click', () => {
    burger.classList.toggle('active');
    mobileMenu?.classList.toggle('active');
    document.body.classList.toggle('no-scroll');
  });

  mobileMenu?.querySelectorAll('.mobile-menu__link').forEach((link) => {
    link.addEventListener('click', () => {
      burger?.classList.remove('active');
      mobileMenu?.classList.remove('active');
      document.body.classList.remove('no-scroll');
    });
  });
}

function initHomePage() {
  const categoriesEl = document.getElementById('categories-grid');
  const reviewsEl = document.getElementById('reviews-grid');
  const featuredEl = document.getElementById('featured-grid');

  if (categoriesEl) renderCategories(categoriesEl);
  if (reviewsEl) renderReviews(reviewsEl);
  if (featuredEl) renderProductCards(featuredEl, getProducts().slice(0, 4));

  const shop = getShopInfo();
  const tagline = document.getElementById('hero-tagline');
  if (tagline) tagline.textContent = shop.tagline;
}

function initContactsPage() {
  const shop = getShopInfo();
  const phoneEl = document.getElementById('contact-phone');
  const emailEl = document.getElementById('contact-email');
  const addressEl = document.getElementById('contact-address');
  const hoursEl = document.getElementById('contact-hours');

  if (phoneEl) phoneEl.textContent = shop.phone;
  if (emailEl) emailEl.textContent = shop.email;
  if (addressEl) addressEl.textContent = shop.address;
  if (hoursEl) hoursEl.textContent = shop.hours;
}

const page = window.location.pathname.split('/').pop() || 'index.html';

initLoader();
initNavigation();
initCart();
initHeaderScroll();

if (page === 'index.html' || page === '') {
  initHomePage();
  initHeroParallax();
  initContactForm('home-contact-form');
} else if (page === 'menu.html') {
  initMenuPage();
} else if (page === 'contacts.html') {
  initContactsPage();
  initContactForm('contact-form');
}

window.addEventListener('load', () => {
  if (page !== 'index.html' && page !== '') {
    initScrollAnimations();
  }
});
