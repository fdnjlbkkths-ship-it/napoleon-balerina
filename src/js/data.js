import data from '../data/products.json';

export function getData() {
  return data;
}

export function getCategories() {
  return data.categories;
}

export function getProducts(category = 'all') {
  if (category === 'all') return data.products;
  return data.products.filter((p) => p.category === category);
}

export function getProductById(id) {
  return data.products.find((p) => p.id === Number(id));
}

export function getCategoryName(categoryId) {
  const cat = data.categories.find((c) => c.id === categoryId);
  return cat ? cat.name : categoryId;
}

export function searchProducts(query) {
  const q = query.toLowerCase().trim();
  if (!q) return data.products;
  return data.products.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      getCategoryName(p.category).toLowerCase().includes(q)
  );
}

export function getReviews() {
  return data.reviews;
}

export function getShopInfo() {
  return data.shop;
}
