import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const bulkHTML = count => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>TEST_ONLY_FICTION</title><body>${Array.from({ length: count }, (_, index) => `<div class="memo"><div class="time">2026-10-01 12:00:00</div><div class="content"><p>TEST_ONLY_FICTION bulk record ${index + 1}</p><p>#test/import</p></div></div>`).join('')}</body></html>`;
// Explicit, generated browser fixture only. Never read or export user diary storage.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = new URL('../output/test-results/flomo-bulk-fiction.html', import.meta.url);
  await fs.mkdir(new URL('.', target), { recursive: true });
  await fs.writeFile(target, bulkHTML(2500));
  console.log('Generated 2,500 TEST_ONLY_FICTION memos in ignored browser fixture.');
}
