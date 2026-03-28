'use strict';

const https = require('https');
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 80;

// In-memory token cache: { accessToken, expiresAt }
let tokenCache = null;

function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: false, // GigaChat uses self-signed cert
    };

    const req = https.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, body: rawBody });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken(basicAuthHeader) {
  const now = Date.now();

  // Return cached token if still valid (with 60s buffer)
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const res = await httpsRequest(
    'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    {
      method: 'POST',
      headers: {
        'Authorization': basicAuthHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'RqUID': crypto.randomUUID(),
      },
    },
    'scope=GIGACHAT_API_PERS'
  );

  if (res.status !== 200) {
    throw new Error(`OAuth failed ${res.status}: ${res.body}`);
  }

  const data = JSON.parse(res.body);
  if (!data.access_token) {
    throw new Error(`No access_token in OAuth response: ${res.body}`);
  }

  // expires_at from GigaChat is milliseconds epoch
  const expiresAt = data.expires_at || now + 30 * 60 * 1000;
  tokenCache = { accessToken: data.access_token, expiresAt };

  return data.access_token;
}

const server = http.createServer(async (req, res) => {
  // Serve static files from dist/
  if (req.url !== '/api/gigachat') {
    const fs = require('fs');
    const path = require('path');
    const distDir = path.join(__dirname, 'dist');

    let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url);

    // Prevent directory traversal
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        // Fallback to index.html for SPA routing
        fs.readFile(path.join(distDir, 'index.html'), (err2, data2) => {
          if (err2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data2);
        });
        return;
      }
      const ext = path.extname(filePath);
      const mime = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      };
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(data);
    });
    return;
  }

  // POST /api/gigachat
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  try {
    // Read request body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyStr = Buffer.concat(chunks).toString('utf8');

    const authHeader = req.headers['authorization'] || '';

    let accessToken;

    if (authHeader.startsWith('Basic ')) {
      // Exchange Basic key for Access Token
      accessToken = await getAccessToken(authHeader);
    } else if (authHeader.startsWith('Bearer ')) {
      // Already a bearer token — use as-is
      accessToken = authHeader.slice(7);
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing Authorization header' }));
      return;
    }

    const gigaRes = await httpsRequest(
      'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      },
      bodyStr
    );

    res.writeHead(gigaRes.status, { 'Content-Type': 'application/json' });
    res.end(gigaRes.body);

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`BPMN Generator Pro server running on port ${PORT}`);
});
