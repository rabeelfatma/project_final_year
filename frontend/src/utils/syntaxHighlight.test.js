import { describe, expect, it } from "vitest";
import { highlightCode, parseDelimitedTable, renderMarkdownLite } from "./syntaxHighlight";

describe("syntaxHighlight helpers", () => {
  it("highlights keywords without executing code", () => {
    const html = highlightCode('const x = "hi"; // note', "javascript");
    expect(html).toContain("qc-syn-kw");
    expect(html).toContain("qc-syn-str");
    expect(html).toContain("qc-syn-com");
  });

  it("parses csv rows", () => {
    const rows = parseDelimitedTable("a,b\n1,2");
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("renders basic markdown safely", () => {
    const html = renderMarkdownLite("# Title\n\n**bold** and `code`");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
  });
});
