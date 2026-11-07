import http from 'node:http';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const files = new Map([
  ['/', [new URL('./index.html', import.meta.url), 'text/html']],
  ['/journal.css', [new URL('./journal.css', import.meta.url), 'text/css']],
  ['/journal.js', [new URL('./journal.js', import.meta.url), 'text/javascript']],
  ['/assets/lucide.min.js', [new URL('../../assets/lucide.min.js', import.meta.url), 'text/javascript']],
]);
export function createServer() {
  return http.createServer(async (request, response) => {
    const host = request.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
      response.writeHead(403); response.end(); return;
    }
    let resource;
    try {
      resource = files.get(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(404); response.end(); return;
    }
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
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4175);
  const server = createServer();
  server.listen(port, '127.0.0.1', () => console.log(`寻光日记体验稿：http://127.0.0.1:${server.address().port}/`));
}
