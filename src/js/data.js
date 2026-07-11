import data from '../data/products.json';
import { smartMatchAny } from './smart-search.js';

export function getData() {
  return data;
}

function isVisible(item) {
  return !item?.hidden;
}

export function getCategories() {
  return data.categories.filter(isVisible);
}

export function getAllCategories() {
  return data.categories;
}

export function getSubcategories(categoryId) {
  const cat = data.categories.find((c) => c.id === categoryId);
  return cat?.subcategories || [];
}

export function getSubcategoryName(categoryId, subcategoryId) {
  const sub = getSubcategories(categoryId).find((s) => s.id === subcategoryId);
  return sub ? sub.name : subcategoryId;
}

export function getProducts(category = 'all', subcategory = 'all') {
  let products = data.products.filter(isVisible);

  if (category !== 'all') {
    products = products.filter((p) => p.category === category);
  }

  if (subcategory !== 'all') {
    products = products.filter((p) => p.subcategory === subcategory);
  }

  return products;
}

export function getAllProducts() {
  return data.products;
}

export function getProductById(id) {
  const product = data.products.find((p) => p.id === Number(id));
  if (!product || product.hidden) return undefined;
  return product;
}

export function getProductImages(product) {
  if (!product) return [];
  if (Array.isArray(product.images) && product.images.length) return product.images;
  if (product.image) return [product.image];
  return [];
}

export function getCategoryName(categoryId) {
  const cat = data.categories.find((c) => c.id === categoryId);
  return cat ? cat.name : categoryId;
}

export function searchProducts(query) {
  const pool = data.products.filter(isVisible);
  const raw = String(query || '').trim();
  if (!raw) return pool;

  return pool.filter((p) => {
    const subName = p.subcategory ? getSubcategoryName(p.category, p.subcategory) : '';
    return smartMatchAny(
      [p.name, p.description, p.fullDescription, getCategoryName(p.category), subName],
      raw
    );
  });
}

export function getReviews() {
  return data.reviews;
}

export function getShopInfo() {
  return data.shop;
}

/** Shared carousel settings: speed + where autoplay is enabled. */
export function getCarouselSettings() {
  const shop = data.shop || {};
  const c = shop.carousels || {};
  const hero = shop.hero || {};
  const intervalMs = Number(c.intervalMs) || Number(hero.intervalMs) || 5500;
  const transitionMs = Number(c.transitionMs) || 1100;
  return {
    intervalMs: Math.min(30000, Math.max(1500, intervalMs)),
    transitionMs: Math.min(5000, Math.max(200, transitionMs)),
    hero: typeof hero.carousel === 'boolean' ? hero.carousel : true,
    products: Boolean(c.products),
  };
}

export function getProductCategoryLabel(product) {
  if (product.subcategory) {
    return `${getCategoryName(product.category)} · ${getSubcategoryName(product.category, product.subcategory)}`;
  }
  return getCategoryName(product.category);
}

export function categoryHasSubcategories(categoryId) {
  return getSubcategories(categoryId).length > 0;
}
