import http from 'node:http';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const files = new Map([
  ['/', [new URL('./index.html', import.meta.url), 'text/html']],
  ['/journal.css', [new URL('./journal.css', import.meta.url), 'text/css']],
  ['/journal.js', [new URL('./journal.js', import.meta.url), 'text/javascript']],
  ['/assets/lucide.min.js', [new URL('../../assets/lucide.min.js', import.meta.url), 'text/javascript']],
]);
const port = Number(process.env.PORT || 4175);
http.createServer(async (request, response) => {
  const host = request.headers.host || '';
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
    response.writeHead(403); response.end(); return;
  }
  const resource = files.get(new URL(request.url, 'http://127.0.0.1').pathname);
  if (request.method !== 'GET' || !resource) {
    response.writeHead(404); response.end(); return;
  }
  try {
    let bytes = await fs.readFile(fileURLToPath(resource[0]));
    if (resource[1] === 'text/html') bytes = Buffer.from(bytes.toString().replace('../../assets/lucide.min.js', '/assets/lucide.min.js'));
    response.writeHead(200, {
      'Content-Type': `${resource[1]}; charset=utf-8`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    response.end(bytes);
  } catch {response.writeHead(404);response.end();}
}).listen(port, '127.0.0.1', () => console.log(`寻光日记体验稿：http://127.0.0.1:${port}/`));
