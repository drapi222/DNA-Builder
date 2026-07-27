import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8081);
const HOST = process.env.HOST || '0.0.0.0';
const API_TARGET = new URL(process.env.API_TARGET || 'http://127.0.0.1:5052');

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
]);

const IMPORTS = {
  '@iwer/devui': '/node_modules/@iwer/devui/build/iwer-devui.module.js',
  iwer: '/node_modules/iwer/build/iwer.module.js',
  three: '/node_modules/three/build/three.module.js',
  'three/addons/': '/node_modules/three/examples/jsm/',
};

function localNetworkUrls() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => `http://${entry.address}:${PORT}`);
}

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function safeResolve(prefix, pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded.replace(/^\/+/, '');
  const absolute = path.resolve(__dirname, relative);
  const allowedRoot = path.resolve(__dirname, prefix);
  if (!absolute.startsWith(allowedRoot + path.sep) && absolute !== allowedRoot) {
    return null;
  }
  return absolute;
}

async function serveIndex(res) {
  const templatePath = path.join(__dirname, 'src', 'index.html');
  const template = await readFile(templatePath, 'utf8');
  const importMap = JSON.stringify({ imports: IMPORTS }, null, 2);
  const moduleTags = [
    '<script type="importmap">',
    importMap,
    '</script>',
    '<script type="module" src="/src/main.js"></script>',
  ].join('\n');
  send(res, 200, template.replace('</body>', `${moduleTags}\n  </body>`), 'text/html; charset=utf-8');
}

async function serveFile(res, pathname) {
  const prefix = pathname.startsWith('/node_modules/') ? 'node_modules' : 'src';
  const filename = safeResolve(prefix, pathname);
  if (!filename) {
    send(res, 403, 'Forbidden');
    return;
  }

  try {
    const info = await stat(filename);
    if (!info.isFile()) {
      send(res, 404, 'Not found');
      return;
    }
  } catch {
    send(res, 404, 'Not found');
    return;
  }

  const ext = path.extname(filename);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES.get(ext) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(filename).pipe(res);
}

function proxyApi(req, res, requestUrl) {
  const headers = { ...req.headers, host: API_TARGET.host };
  delete headers.connection;

  const proxyReq = http.request(
    {
      hostname: API_TARGET.hostname,
      port: API_TARGET.port || 80,
      path: `${requestUrl.pathname}${requestUrl.search}`,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (error) => {
    send(
      res,
      502,
      `DNA Builder API is not reachable at ${API_TARGET.href}\n\n${error.message}`,
    );
  });

  req.pipe(proxyReq);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    if (requestUrl.pathname.startsWith('/api/')) {
      proxyApi(req, res, requestUrl);
      return;
    }

    if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
      await serveIndex(res);
      return;
    }

    if (requestUrl.pathname.startsWith('/src/') || requestUrl.pathname.startsWith('/node_modules/')) {
      await serveFile(res, requestUrl.pathname);
      return;
    }

    if (requestUrl.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    send(res, 404, 'Not found');
  } catch (error) {
    console.error(error);
    send(res, 500, error.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`DNA Builder VR      -> http://localhost:${PORT}`);
  localNetworkUrls().forEach((url) => console.log(`Same-Wi-Fi URL       -> ${url}`));
  console.log(`API proxy            -> ${API_TARGET.href}`);
  console.log('');
  console.log('Recommended Quest 3 USB launch:');
  console.log(`  npm run quest:reverse`);
  console.log(`  Open http://localhost:${PORT} in Meta Quest Browser`);
});
