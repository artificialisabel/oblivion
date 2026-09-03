export function normalizeTextareaNewlines(value) {
  return String(value ?? '').replace(/\r\n|\r/g, '\n');
}

export function detectPreferredNewline(value) {
  const source = String(value ?? '');
  const counts = new Map([
    ['\r\n', source.match(/\r\n/g)?.length ?? 0],
    ['\r', source.replace(/\r\n/g, '').match(/\r/g)?.length ?? 0],
    ['\n', source.replace(/\r\n/g, '').match(/\n/g)?.length ?? 0]
  ]);
  const maximum = Math.max(...counts.values());
  if (maximum === 0) return '\n';

  // For mixed files, keep the first newline style among the tied majorities.
  for (const match of source.matchAll(/\r\n|\r|\n/g)) {
    if (counts.get(match[0]) === maximum) return match[0];
  }
  return '\n';
}

export function serializeTextareaContent(editorValue, originalContent = '') {
  const normalizedEditor = normalizeTextareaNewlines(editorValue);
  const original = String(originalContent ?? '');

  // A browser textarea normalizes every newline to LF. If the normalized text is
  // unchanged, return the original bytes rather than silently rewriting the file.
  if (normalizedEditor === normalizeTextareaNewlines(original)) return original;

  const newline = detectPreferredNewline(original);
  return newline === '\n' ? normalizedEditor : normalizedEditor.replace(/\n/g, newline);
}
