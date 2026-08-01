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

const MIRROR_BODY_LIMIT = 5 * 1024 * 1024;
const mirrorClients = new Set();
let mirrorState = {
  model: null,
  pose: null,
  source: {
    connected: false,
    mode: 'waiting',
  },
  updatedAt: null,
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

async function serveHtml(res, filename, entrypoint) {
  const templatePath = path.join(__dirname, 'src', filename);
  const template = await readFile(templatePath, 'utf8');
  const importMap = JSON.stringify({ imports: IMPORTS }, null, 2);
  const moduleTags = [
    '<script type="importmap">',
    importMap,
    '</script>',
    `<script type="module" src="${entrypoint}"></script>`,
  ].join('\n');
  send(res, 200, template.replace('</body>', `${moduleTags}\n  </body>`), 'text/html; charset=utf-8');
}

async function serveIndex(res) {
  await serveHtml(res, 'index.html', '/src/main.js');
}

async function serveMirrorIndex(res) {
  await serveHtml(res, 'mirror.html', '/src/mirror.js');
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

function sendJson(res, status, body) {
  send(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

function sendMirrorEvent(res, eventName, data) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastMirrorState() {
  mirrorClients.forEach((client) => {
    sendMirrorEvent(client, 'state', mirrorState);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MIRROR_BODY_LIMIT) {
        reject(new Error('Mirror payload is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Mirror payload must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

async function handleMirrorState(req, res) {
  if (req.method === 'GET') {
    sendJson(res, 200, mirrorState);
    return;
  }

  if (req.method !== 'POST') {
    send(res, 405, 'Method not allowed');
    return;
  }

  try {
    const update = await readJsonBody(req);
    mirrorState = {
      ...mirrorState,
      ...update,
      model: update.model ?? mirrorState.model,
      pose: update.pose ?? mirrorState.pose,
      source: {
        ...mirrorState.source,
        ...update.source,
        connected: true,
      },
      updatedAt: new Date().toISOString(),
    };
    broadcastMirrorState();
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
  }
}

function handleMirrorEvents(req, res) {
  if (req.method !== 'GET') {
    send(res, 405, 'Method not allowed');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');
  mirrorClients.add(res);
  sendMirrorEvent(res, 'state', mirrorState);

  req.on('close', () => {
    mirrorClients.delete(res);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    if (requestUrl.pathname === '/mirror/state') {
      await handleMirrorState(req, res);
      return;
    }

    if (requestUrl.pathname === '/mirror/events') {
      handleMirrorEvents(req, res);
      return;
    }

    if (requestUrl.pathname.startsWith('/api/')) {
      proxyApi(req, res, requestUrl);
      return;
    }

    if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
      await serveIndex(res);
      return;
    }

    if (requestUrl.pathname === '/mirror' || requestUrl.pathname === '/mirror.html') {
      await serveMirrorIndex(res);
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
  console.log(`Laptop mirror       -> http://localhost:${PORT}/mirror`);
  localNetworkUrls().forEach((url) => console.log(`Same-Wi-Fi URL       -> ${url}`));
  console.log(`API proxy            -> ${API_TARGET.href}`);
  console.log('');
  console.log('Recommended Quest 3 USB launch:');
  console.log(`  npm run quest:reverse`);
  console.log(`  Open http://localhost:${PORT} in Meta Quest Browser`);
});
