const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// The renderer lives in a DOM-free classic <script id="renderer"> inside the
// shipped template. Evaluating that exact block keeps these tests on the code
// users run, not on a copy that could drift.
const template = fs.readFileSync(path.join(__dirname, "..", "src", "webview.html"), "utf8");
const block = template.match(/<script nonce="\{\{NONCE\}\}" id="renderer">([\s\S]*?)<\/script>/);
assert.ok(block, "renderer script block not found in webview.html");
const sandbox = vm.createContext({});
vm.runInContext(block[1], sandbox);
const { renderInline, renderMarkdownToHtml, escapeHtml } = /** @type {Record<string, (s: string) => string>} */ (
	/** @type {unknown} */ (sandbox)
);

describe("renderInline", () => {
	it("leaves snake_case identifiers untouched", () => {
		assert.equal(renderInline("call my_var_name here"), "call my_var_name here");
	});

	it("leaves __dunder__ words inside identifiers untouched", () => {
		assert.equal(renderInline("a__b__c"), "a__b__c");
	});

	it("renders _emphasis_ at word edges", () => {
		assert.equal(renderInline("say _hi_ now"), "say <em>hi</em> now");
	});

	it("renders __strong__ and **strong** at word edges", () => {
		assert.equal(renderInline("__a__ and **b**"), "<strong>a</strong> and <strong>b</strong>");
	});

	it("renders *emphasis*", () => {
		assert.equal(renderInline("an *odd* word"), "an <em>odd</em> word");
	});

	it("does not italicize spaced asterisks used as multiplication", () => {
		assert.equal(renderInline("2 * 3 * 4"), "2 * 3 * 4");
	});

	it("does not apply emphasis inside code spans", () => {
		assert.equal(renderInline("`**not bold** a_b_`"), "<code>**not bold** a_b_</code>");
	});

	it("escapes HTML inside code spans and in text", () => {
		assert.equal(renderInline("`<b>` <i>"), "<code>&lt;b&gt;</code> &lt;i&gt;");
	});
});

describe("renderMarkdownToHtml", () => {
	it("escapes HTML in paragraphs so document text cannot inject markup", () => {
		const html = renderMarkdownToHtml("<img src=x onerror=alert(1)>");
		assert.ok(!html.includes("<img"), html);
		assert.ok(html.includes("&lt;img"), html);
	});

	it('keeps Mermaid fence text escaped inside <pre class="mermaid">', () => {
		const html = renderMarkdownToHtml("```mermaid\nA-->B<script>x</script>\n```");
		assert.equal(html, '<pre class="mermaid">A--&gt;B&lt;script&gt;x&lt;/script&gt;\n</pre>');
	});

	it("renders the Azure DevOps ::: mermaid fence the same way", () => {
		const html = renderMarkdownToHtml("::: mermaid\ngraph LR\n  A --> B\n:::");
		assert.equal(html, '<pre class="mermaid">graph LR\n  A --&gt; B\n</pre>');
	});

	it("shows other fenced code as escaped text", () => {
		const html = renderMarkdownToHtml("```js\nif (a < b) {}\n```");
		assert.equal(html, "<pre><code>if (a &lt; b) {}\n</code></pre>");
	});

	it("renders https images and escapes attribute values", () => {
		const html = renderMarkdownToHtml('![a"b](https://example.com/x.png)');
		assert.equal(html, '<img src="https://example.com/x.png" alt="a&quot;b" />');
	});

	it("does not render javascript: or data: images", () => {
		assert.ok(!renderMarkdownToHtml("![x](javascript:alert(1))").includes("<img"));
		assert.ok(!renderMarkdownToHtml("![x](data:text/html;base64,AAAA)").includes("<img"));
	});

	it("renders headings, lists and rules", () => {
		const html = renderMarkdownToHtml("# T\n- a\n- b\n1. c\n---");
		assert.equal(html, "<h1>T</h1><ul><li>a</li><li>b</li></ul><ol><li>c</li></ol><hr />");
	});

	it("handles CRLF line endings", () => {
		assert.equal(renderMarkdownToHtml("# T\r\n- a"), "<h1>T</h1><ul><li>a</li></ul>");
	});
});

describe("escapeHtml", () => {
	it("escapes the four significant characters", () => {
		assert.equal(escapeHtml('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");
	});
});
