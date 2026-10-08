'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const requestedPort = process.argv[2];
const port = requestedPort === undefined ? 18080 : Number(requestedPort);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('포트는 0부터 65535 사이의 정수여야 합니다.');
  process.exit(1);
}
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.bmp': 'image/bmp', '.xdelta': 'application/octet-stream' };

const server = http.createServer((request, response) => {
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
});

server.on('error', (error) => {
  if (requestedPort === undefined && ['EACCES', 'EADDRINUSE'].includes(error.code)) {
    console.warn(`기본 포트 ${port}을(를) 사용할 수 없어 다른 포트를 선택합니다.`);
    server.listen(0, '127.0.0.1');
    return;
  }
  console.error(`서버를 시작할 수 없습니다: ${error.message}`);
  process.exitCode = 1;
});
server.on('listening', () => console.log(`http://127.0.0.1:${server.address().port}/`));
server.listen(port, '127.0.0.1');
