/**
 * Local-only admin API for Vite dev server.
 * Writes catalog to src/data/products.json and uploads images.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'src', 'data', 'products.json');
const uploadDir = path.join(root, 'public', 'images', 'products', 'uploads');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function getPin() {
  return process.env.ADMIN_PIN || process.env.VITE_ADMIN_PIN || '';
}

function checkAuth(req) {
  const pin = getPin();
  if (!pin) return true;
  const header = req.headers['x-admin-pin'] || '';
  return header === pin;
}

function validateCatalog(data) {
  if (!data || typeof data !== 'object') return 'Invalid JSON root';
  if (!Array.isArray(data.categories)) return 'categories must be an array';
  if (!Array.isArray(data.products)) return 'products must be an array';
  if (!data.categories.length) return 'categories must not be empty';
  if (!data.products.length) return 'products must not be empty';
  const named = data.products.filter((p) => p && String(p.name || '').trim()).length;
  if (named < Math.ceil(data.products.length * 0.5)) {
    return 'too many products without names — refusing to overwrite catalog';
  }
  if (!data.shop || typeof data.shop !== 'object') return 'shop object required';
  return null;
}

function parseMultipart(buffer, boundary) {
  const parts = [];
  const sep = Buffer.from(`--${boundary}`);
  let start = buffer.indexOf(sep) + sep.length;
  while (start < buffer.length) {
    if (buffer[start] === 45 && buffer[start + 1] === 45) break; // --
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    const next = buffer.indexOf(sep, start);
    if (next < 0) break;
    let part = buffer.subarray(start, next - 2); // trim \r\n
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd >= 0) {
      const headers = part.subarray(0, headerEnd).toString('utf8');
      const body = part.subarray(headerEnd + 4);
      const nameMatch = headers.match(/name="([^"]+)"/);
      const fileMatch = headers.match(/filename="([^"]+)"/);
      parts.push({
        name: nameMatch?.[1] || '',
        filename: fileMatch?.[1] || '',
        data: body,
      });
    }
    start = next + sep.length;
  }
  return parts;
}

function slugify(name) {
  return String(name || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'image';
}

export function adminApiPlugin() {
  return {
    name: 'napoleon-admin-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] || '';
        if (!url.startsWith('/api/admin')) return next();

        try {
          if (url === '/api/admin/auth' && req.method === 'POST') {
            const raw = await readBody(req);
            let body = {};
            try {
              body = JSON.parse(raw.toString('utf8') || '{}');
            } catch {
              body = {};
            }
            const pin = getPin();
            if (!pin) {
              return sendJson(res, 200, { ok: true, pinRequired: false });
            }
            if (body.pin === pin) {
              return sendJson(res, 200, { ok: true, pinRequired: true });
            }
            return sendJson(res, 401, { ok: false, error: 'Неверный PIN' });
          }

          if (url === '/api/admin/status' && req.method === 'GET') {
            return sendJson(res, 200, {
              ok: true,
              pinRequired: Boolean(getPin()),
              mode: 'dev',
            });
          }

          if (!checkAuth(req)) {
            return sendJson(res, 401, { error: 'Unauthorized' });
          }

          if (url === '/api/admin/catalog' && req.method === 'GET') {
            const json = fs.readFileSync(catalogPath, 'utf8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(json);
            return;
          }

          if (url === '/api/admin/catalog' && req.method === 'PUT') {
            const raw = await readBody(req);
            let data;
            try {
              data = JSON.parse(raw.toString('utf8'));
            } catch {
              return sendJson(res, 400, { error: 'Invalid JSON' });
            }
            const err = validateCatalog(data);
            if (err) return sendJson(res, 400, { error: err });

            // Don't let empty admin fields wipe known products on disk
            if (fs.existsSync(catalogPath)) {
              try {
                const prev = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
                const prevById = new Map((prev.products || []).map((p) => [p.id, p]));
                data.products = data.products.map((p) => {
                  const src = prevById.get(p.id);
                  if (!src) return p;
                  if (String(p.name || '').trim()) return p;
                  return { ...src, ...p, name: src.name, description: p.description || src.description,
                    fullDescription: p.fullDescription || src.fullDescription,
                    composition: p.composition || src.composition,
                    price: p.price || src.price,
                    priceOld: p.priceOld ?? src.priceOld,
                    weight: p.weight || src.weight,
                    size: p.size || src.size,
                    prepTime: p.prepTime || src.prepTime,
                    fillings: (p.fillings && p.fillings.length) ? p.fillings : src.fillings,
                    images: (p.images && p.images.length) ? p.images : src.images,
                    image: p.image || src.image,
                  };
                });
              } catch {
                /* keep incoming */
              }
            }

            // backup
            const bak = catalogPath + '.bak';
            if (fs.existsSync(catalogPath)) {
              fs.copyFileSync(catalogPath, bak);
            }
            fs.writeFileSync(catalogPath, JSON.stringify(data, null, 2), 'utf8');
            return sendJson(res, 200, {
              ok: true,
              products: data.products.length,
              categories: data.categories.length,
            });
          }

          if (url === '/api/admin/upload' && req.method === 'POST') {
            const ctype = req.headers['content-type'] || '';
            const m = ctype.match(/boundary=(.+)$/);
            if (!m) return sendJson(res, 400, { error: 'Expected multipart form' });

            const buffer = await readBody(req);
            const parts = parseMultipart(buffer, m[1].trim());
            const file = parts.find((p) => p.name === 'file' && p.filename);
            if (!file) return sendJson(res, 400, { error: 'file field required' });

            fs.mkdirSync(uploadDir, { recursive: true });
            const ext = path.extname(file.filename).toLowerCase() || '.jpg';
            const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
            if (!allowed.includes(ext)) {
              return sendJson(res, 400, { error: 'Only jpg/png/webp/gif allowed' });
            }
            const stamp = Date.now().toString(36);
            const base = slugify(path.basename(file.filename, ext));
            const filename = `${base}-${stamp}${ext}`;
            const abs = path.join(uploadDir, filename);
            fs.writeFileSync(abs, file.data);
            const rel = `images/products/uploads/${filename}`;
            return sendJson(res, 200, { ok: true, path: rel, url: '/' + rel });
          }

          return sendJson(res, 404, { error: 'Not found' });
        } catch (e) {
          console.error('[admin-api]', e);
          return sendJson(res, 500, { error: String(e.message || e) });
        }
      });
    },
  };
}
