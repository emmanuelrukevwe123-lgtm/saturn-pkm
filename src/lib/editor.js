/* Converts the rich editor's DOM back to the stored Markdown-ish format. */

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function imageToken(element) {
  return `{{img:${element.dataset.img}${element.dataset.w ? `:${element.dataset.w}` : ""}}}`;
}

function inline(node) {
  let text = "";
  for (const child of node.childNodes) {
    if (child.nodeType === TEXT_NODE) { text += child.textContent; continue; }
    if (child.nodeType !== ELEMENT_NODE) continue;
    const tag = child.tagName;
    if (tag === "BR") { text += "\n"; continue; }
    if (child.dataset.img) { text += imageToken(child); continue; }
    if (tag === "IMG") continue;
    const inner = inline(child);
    if (child.classList.contains("wiki-link")) text += `[[${(child.dataset.link || inner).trim()}]]`;
    else if (tag === "STRONG" || tag === "B") text += inner.trim() ? `**${inner}**` : inner;
    else if (tag === "EM" || tag === "I") text += inner.trim() ? `*${inner}*` : inner;
    else if (tag === "CODE") text += inner.trim() ? `\`${inner}\`` : inner;
    else text += inner;
  }
  return text;
}

export function domToMarkdown(root) {
  const out = [];
  const block = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === TEXT_NODE) {
        if (child.textContent.trim()) out.push(child.textContent);
        continue;
      }
      if (child.nodeType !== ELEMENT_NODE) continue;
      const tag = child.tagName;
      if (child.dataset.img) { out.push(imageToken(child), ""); continue; }
      if (/^H[1-3]$/.test(tag)) {
        out.push(`${"#".repeat(Number(tag[1]))} ${inline(child).trim()}`, "");
      } else if (tag === "UL" || tag === "OL") {
        for (const item of child.children) out.push(`- ${inline(item).trim()}`);
        out.push("");
      } else if ((tag === "P" || tag === "DIV") && child.querySelector("h1,h2,h3,ul,ol,p,div")) {
        block(child);
      } else if (tag === "BR") {
        out.push("");
      } else {
        out.push(inline(child), "");
      }
    }
  };
  block(root);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
