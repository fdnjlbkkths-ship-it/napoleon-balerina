import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import { adminApiPlugin } from './scripts/vite-admin-plugin.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base =
  process.env.GITHUB_ACTIONS && repoName ? `/${repoName}/` : '/';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.ADMIN_PIN && !process.env.ADMIN_PIN) process.env.ADMIN_PIN = env.ADMIN_PIN;
  if (env.VITE_ADMIN_PIN && !process.env.VITE_ADMIN_PIN) {
    process.env.VITE_ADMIN_PIN = env.VITE_ADMIN_PIN;
  }

  return {
    base,
    plugins: [adminApiPlugin()],
    server: {
      watch: {
        ignored: [
          '**/public/fonts/cerca-preview/**',
          '**/src/data/products.json.bak',
        ],
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          menu: resolve(__dirname, 'menu.html'),
          product: resolve(__dirname, 'product.html'),
          about: resolve(__dirname, 'about.html'),
          contacts: resolve(__dirname, 'contacts.html'),
          privacy: resolve(__dirname, 'privacy.html'),
          checkout: resolve(__dirname, 'checkout.html'),
          // admin.html intentionally omitted from production build
        },
      },
    },
  };
});
