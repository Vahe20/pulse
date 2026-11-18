import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openStore, seed } from './store.js';
import { createApi, HttpError } from './api.js';
import { worker } from './analysis.js';

const assets = new Map(Object.entries({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
}).map(([key, [file, type]]) => [key, { type, data: readFileSync(new URL(`../public/${file}`, import.meta.url)) }]));

async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(415, 'Use application/json.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 256000) {
      req.resume();
      throw new HttpError(413, 'Request is too large.');
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
    return body;
  } catch {
    throw new HttpError(400, 'Invalid JSON object.');
  }
}

export function createPulse(config) {
  const store = openStore(config.database);
  seed(store, config);
  store.run("UPDATE analyses SET status='Queued' WHERE status='Processing'");
  const jobs = worker(store, config);
  const api = createApi(store, jobs, config);
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url, 'http://pulse.local');
      const asset = assets.get(url.pathname);
      if (asset && ['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(200, { 'Content-Type': asset.type });
        return res.end(req.method === 'HEAD' ? undefined : asset.data);
      }
      if (url.pathname === '/api/config' && req.method === 'GET') return json(200, { demo: Boolean(config.demo) });
      if (!url.pathname.startsWith('/api/')) return json(404, { error: 'Not found.' });
      const writes = ['POST', 'PUT'].includes(req.method);
      if (writes && ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) throw new HttpError(403, 'Cross-origin requests are unavailable.');
      const body = writes ? await readJson(req) : {};
      json(200, await api(req.method, url, req.headers, body, req.socket.remoteAddress, res));
    } catch (error) {
      if (error instanceof HttpError) json(error.status, { error: error.message });
      else if (error.message?.includes('UNIQUE constraint failed')) json(409, { error: 'A record with that name or email already exists.' });
      else {
        console.error(error);
        json(500, { error: 'An unexpected error occurred.' });
      }
    }
  });
  let cycle;
  const tick = () => {
    jobs.tick();
    if (cycle) return;
    cycle = jobs.analyzeNext().catch(console.error).finally(() => { cycle = undefined; });
  };
  const interval = setInterval(() => {
    try { tick(); } catch (error) { console.error('Background cycle failed', error); }
  }, config.interval ?? 2000);
  interval.unref();
  server.on('close', () => {
    clearInterval(interval);
    Promise.resolve(cycle).finally(() => store.db.close());
  });
  tick();
  return { server, store, jobs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const env = process.env;
  const demo = env.PULSE_DEMO === '1';
  const port = Number(env.PORT ?? 3000);
  const host = env.HOST ?? '127.0.0.1';
  const { server } = createPulse({
    demo, database: env.PULSE_DATABASE ?? (demo ? 'data/pulse-demo.sqlite' : 'data/pulse.sqlite'),
    email: env.PULSE_ADMIN_EMAIL, password: env.PULSE_ADMIN_PASSWORD,
    secureCookie: env.PULSE_SECURE_COOKIE === '1', allowExternal: env.PULSE_ALLOW_EXTERNAL_AI === '1',
    provider: env.PULSE_AI_URL && env.PULSE_AI_MODEL && env.PULSE_AI_KEY
      ? { url: env.PULSE_AI_URL, model: env.PULSE_AI_MODEL, key: env.PULSE_AI_KEY } : null,
  });
  server.listen(port, host, () => console.log(`Pulse is available at http://${host}:${port}`));
}
