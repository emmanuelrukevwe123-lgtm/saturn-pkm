// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { domToMarkdown } from "../../src/lib/editor.js";
import { renderMarkdown } from "../../src/lib/markdown.js";

function fromHtml(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  return domToMarkdown(root);
}

describe("domToMarkdown", () => {
  it.each([
    ["# Title"],
    ["Some **bold** and *em* and `code`"],
    ["- one\n- two"],
    ["See [[Q&A \"notes\"]] here"],
    ["Text with <angle> & ampersand"],
    ["{{img:abc-1:50}}"],
  ])("round-trips %s through the editor", (source) => {
    expect(fromHtml(renderMarkdown(source))).toBe(source);
  });

  it("drops foreign images that aren't Saturn's own", () => {
    expect(fromHtml('<p>a<img src="https://evil.example/x.png"></p>')).toBe("a");
  });

  it("keeps a stored image's token when it's rendered with a URL", () => {
    expect(fromHtml(renderMarkdown("{{img:abc}}", { imageUrl: () => "blob:x" }))).toBe("{{img:abc}}");
  });
});
