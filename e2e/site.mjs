/**
 * Local pages for the e2e tests: `/page/<n>` — a page titled «Страница <n>», nothing from the
 * network. `node e2e/site.mjs <port>`.
 */
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 4173);

createServer((request, response) => {
  const match = /^\/(page|video)\/([\w-]+)/.exec(request.url ?? '');
  if (!match) {
    response.writeHead(404).end();
    return;
  }
  const [, kind, name] = match;
  const title = kind === 'video' ? `Видео ${name}` : `Страница ${name}`;
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title></head>` +
      `<body><h1>${title}</h1></body></html>`,
  );
}).listen(port, '127.0.0.1');
