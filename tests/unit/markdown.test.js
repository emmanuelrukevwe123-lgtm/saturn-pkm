import { describe, expect, it } from "vitest";
import { escapeHTML, renderMarkdown } from "../../src/lib/markdown.js";

describe("renderMarkdown", () => {
  it("renders the supported subset", () => {
    expect(renderMarkdown("# Title\n**bold** *em* `code`\n- item")).toBe(
      "<h1>Title</h1><p><strong>bold</strong> <em>em</em> <code>code</code></p><ul><li>item</li></ul>");
  });

  it.each([
    ["<img src=x onerror=alert(1)>"],
    ["<script>alert(1)</script>"],
    ["**<svg onload=alert(1)>**"],
    ["[[<img src=x onerror=alert(1)>]]"],
    ["[[x\" onclick=\"alert(1)]]"],
    ["`<b>`"],
    ["# <iframe src=javascript:alert(1)>"],
    ["- <a href=javascript:alert(1)>x</a>"],
  ])("leaves no live markup in %s", (source) => {
    const html = renderMarkdown(source);
    expect(html).not.toMatch(/<(img|script|svg|iframe|b)\b/);
    expect(html).not.toMatch(/<a [^>]*href=/);
    expect(html).not.toMatch(/ on\w+="/);
  });

  it("keeps a title with special characters intact in data-link", () => {
    const html = renderMarkdown("[[Q&A \"notes\"]]", { noteExists: () => true });
    expect(html).toBe('<p><a class="wiki-link" data-link="Q&amp;A &quot;notes&quot;">Q&amp;A &quot;notes&quot;</a></p>');
  });

  it("doesn't apply formatting inside a link title", () => {
    expect(renderMarkdown("[[a*b*c]]")).toContain('data-link="a*b*c"');
  });

  it("marks missing notes", () => {
    expect(renderMarkdown("[[Ghost]]")).toContain('class="wiki-link missing"');
  });

  it("shows a placeholder for images that aren't on this device, keeping the token data", () => {
    expect(renderMarkdown("{{img:abc-1:50}}")).toContain('data-img="abc-1" data-w="50"');
  });

  it("clamps image widths and only accepts blob URLs", () => {
    expect(renderMarkdown("{{img:a:999}}", { imageUrl: () => "blob:x" })).not.toContain("data-w");
    expect(renderMarkdown("{{img:a:1}}", { imageUrl: () => "blob:x" })).toContain('style="width:10%"');
    expect(renderMarkdown("{{img:a}}", { imageUrl: () => "https://evil.example/x.png" })).not.toContain("evil");
  });

  it("escapes single quotes too", () => {
    expect(escapeHTML("'")).toBe("&#39;");
  });
});
