(() => {
  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_RECORDS = 40000;
  function timestamp(value) {
    const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;
    const [, y, m, d, h, min, sec = '00'] = match;
    const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
    if (!Number(y) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== `${y}-${m}-${d}` || +h > 23 || +min > 59 || +sec > 59) return null;
    return { date: `${y}-${m}-${d}`, time: `${h}:${min}:${sec}` };
  }
  function plainText(root) {
    const ignored = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'TEMPLATE', 'NOSCRIPT']);
    const blocks = new Set(['P', 'DIV', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4']);
    function walk(node, inPre = false) {
      if (node.nodeType === 3) return inPre ? node.nodeValue : (/^[\t\r\n ]+$/.test(node.nodeValue) && /[\r\n]/.test(node.nodeValue) ? '' : node.nodeValue.replace(/[\t\r\n]+/g, ' '));
      if (node.nodeType !== 1 || ignored.has(node.tagName)) return '';
      if (node.tagName === 'BR') return '\n';
      if (node.tagName === 'IMG') return '';
      const pre = inPre || node.tagName === 'PRE';
      let text = Array.from(node.childNodes).map(child => walk(child, pre)).join('');
      if (node.tagName === 'A') { const href = node.getAttribute('href') || ''; if (/^(https?:|mailto:)/i.test(href) && text.trim() !== href) text += ` (${href})`; }
      if (node.tagName === 'LI') text = `${node.parentElement?.tagName === 'OL' ? `${Array.from(node.parentElement.children).indexOf(node) + 1}.` : '-'} ${text.trim()}\n`;
      else if (blocks.has(node.tagName)) text = `\n${text}\n`;
      return text;
    }
    return Array.from(root.childNodes).map(node => walk(node)).join('').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
  }
  function parseHTML(html, doc) {
    if (new TextEncoder().encode(html).length > MAX_BYTES) throw new Error('HTML 超过 20 MB，请在 flomo 按日期分批导出。');
    // Template content stays detached and inert: never execute or mount exported HTML.
    const template = doc.createElement('template');
    template.innerHTML = html;
    const memos = Array.from(template.content.querySelectorAll('.memo'));
    if (!memos.length) throw new Error('没有找到 flomo 记录。请选择官方导出的 HTML，不是网页另存为文件。');
    if (memos.length > MAX_RECORDS) throw new Error('记录超过 40,000 条，请按日期分批导出。');
    const records = [];
    let invalid = 0, empty = 0, media = 0;
    for (const memo of memos) {
      const content = memo.querySelector('.content');
      const time = timestamp(memo.querySelector('.time')?.textContent || '');
      if (!content || !time) { invalid++; continue; }
      if (content.querySelector('img, audio, video, object, iframe, a[download]')) media++;
      const text = plainText(content);
      if (!text.trim()) { empty++; continue; }
      const tags = [...new Set(Array.from(text.matchAll(/(?:^|\s)#([^\s#]+)/gu), match => match[1]))];
      records.push({ ...time, text, tags, source: 'flomo' });
    }
    return { total: memos.length, records, invalid, empty, media };
  }
  const key = note => JSON.stringify([note.date, /^\d{2}:\d{2}$/.test(note.time || '') ? `${note.time}:00` : note.time || '', note.text]);
  function plan(records, existing) {
    const seen = new Set(existing.map(key)), notes = [];
    let duplicates = 0;
    for (const record of records) {
      const fingerprint = key(record);
      if (seen.has(fingerprint)) { duplicates++; continue; }
      seen.add(fingerprint); notes.push(record);
    }
    return { notes, duplicates };
  }
  async function identify(notes, cryptoAPI) {
    return Promise.all(notes.map(async note => {
      const hash = await cryptoAPI.subtle.digest('SHA-256', new TextEncoder().encode(key(note)));
      const id = `flomo-${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`;
      return { ...note, id };
    }));
  }
  window.SeekingLightImport = { MAX_BYTES, timestamp, parseHTML, plainText, plan, identify };
})();
