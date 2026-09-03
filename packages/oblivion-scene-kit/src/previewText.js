export function formatNotePreview(content, maxWords = 250) {
  const cleaned = String(content ?? '')
    .replace(/\r/g, '')
    .replace(/^\uFEFF?---[ \t]*\n[\s\S]*?\n---[ \t]*\n?/, '')
    .replace(/!\[\[[^\]]+\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => alias || target)
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, maxWords);
  return words.join(' ');
}

export function formatPreviewNote(note, maxWords = 250) {
  return formatNotePreview(note?.body ?? note?.content, maxWords);
}

export function wrapPreviewText(text, width, maxLines) {
  const lines = [];
  const paragraphs = String(text ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    let current = '';
    for (const word of paragraph.split(' ')) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > width && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
      if (lines.length >= maxLines) break;
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (lines.length >= maxLines) break;
  }
  if (!lines.length) lines.push('empty note');
  return lines;
}
