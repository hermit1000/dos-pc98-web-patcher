'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2] || 8080);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.bmp': 'image/bmp', '.xdelta': 'application/octet-stream' };

http.createServer((request, response) => {
  try {
    const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
    const filePath = path.resolve(root, relative);
    if (!filePath.startsWith(root + path.sep)) throw new Error('Unsafe path');
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error('Not a file');
    response.setHeader('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(response);
  } catch {
    response.statusCode = 404;
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`));
