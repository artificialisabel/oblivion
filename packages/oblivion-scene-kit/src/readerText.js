export function appendLinkedText(target, text) {
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const bareUrlPattern = /https?:\/\/[^\s<>()]+/g;
  let index = 0;

  function appendBareLinks(segment) {
    let segmentIndex = 0;
    for (const match of segment.matchAll(bareUrlPattern)) {
      if (match.index > segmentIndex) {
        target.append(document.createTextNode(segment.slice(segmentIndex, match.index)));
      }
      const anchor = document.createElement('a');
      anchor.href = match[0];
      anchor.textContent = match[0];
      anchor.target = '_blank';
      anchor.rel = 'noreferrer';
      target.append(anchor);
      segmentIndex = match.index + match[0].length;
    }
    if (segmentIndex < segment.length) target.append(document.createTextNode(segment.slice(segmentIndex)));
  }

  for (const match of text.matchAll(markdownLinkPattern)) {
    appendBareLinks(text.slice(index, match.index));
    const anchor = document.createElement('a');
    anchor.href = match[2];
    anchor.textContent = match[1];
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    target.append(anchor);
    index = match.index + match[0].length;
  }
  appendBareLinks(text.slice(index));
}

export function formatExternalLinks(links = []) {
  if (!links.length) return '';
  return `\n\nexternal links\n${links.map((link) => `- ${link}`).join('\n')}`;
}

export function renderReaderTextElement(target, text) {
  if (!target) return;
  target.replaceChildren();
  appendLinkedText(target, text);
}
