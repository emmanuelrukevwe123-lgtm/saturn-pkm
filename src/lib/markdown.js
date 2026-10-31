/* The small Markdown subset Saturn stores notes in. Every piece of user text
   leaves through escapeHTML exactly once, so notes, task notes and AI answers
   can't inject markup, and link titles reach data-link unmangled. */

const INLINE = /\{\{img:([\w-]+)(?::(\d+))?\}\}|\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;

export function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function imageHTML(id, rawWidth, imageUrl) {
  const url = imageUrl(String(id));
  const width = rawWidth ? Math.min(100, Math.max(10, Number(rawWidth))) : 100;
  const widthAttr = width !== 100 ? ` data-w="${width}"` : "";
  if (!url) return `<span class="img-missing" contenteditable="false" data-img="${id}"${widthAttr}>image not on this device</span>`;
  // Only object URLs from our own image store ever reach src.
  if (!url.startsWith("blob:")) return "";
  const style = width !== 100 ? ` style="width:${width}%"` : "";
  return `<img class="note-img" alt="" src="${escapeHTML(url)}" data-img="${id}"${widthAttr}${style}>`;
}

export function wikiLinkHTML(rawTitle, exists) {
  const title = escapeHTML(rawTitle.trim());
  return `<a class="${exists ? "wiki-link" : "wiki-link missing"}" data-link="${title}">${title}</a>`;
}

function inline(text, context) {
  let html = "";
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    html += escapeHTML(text.slice(last, match.index));
    last = match.index + match[0].length;
    const [, imageId, imageWidth, wiki, bold, italic, code] = match;
    if (imageId) html += imageHTML(imageId, imageWidth, context.imageUrl);
    else if (wiki) html += wikiLinkHTML(wiki, context.noteExists(wiki));
    else if (bold) html += `<strong>${inline(bold, context)}</strong>`;
    else if (italic) html += `<em>${inline(italic, context)}</em>`;
    else html += `<code>${escapeHTML(code)}</code>`;
  }
  return html + escapeHTML(text.slice(last));
}

export function renderMarkdown(source, { noteExists = () => false, imageUrl = () => null } = {}) {
  const context = { noteExists, imageUrl };
  let html = "";
  let inList = false;
  for (const line of String(source ?? "").split("\n")) {
    const listItem = line.match(/^-\s+(.*)/);
    if (listItem) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(listItem[1], context)}</li>`;
      continue;
    }
    if (inList) { html += "</ul>"; inList = false; }
    const heading = line.match(/^(#{1,3})\s+(.*)/);
    if (heading) html += `<h${heading[1].length}>${inline(heading[2], context)}</h${heading[1].length}>`;
    else if (line.trim()) html += `<p>${inline(line, context)}</p>`;
  }
  return inList ? `${html}</ul>` : html;
}
