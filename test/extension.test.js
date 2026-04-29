const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Minimal vscode stub - extension.js requires vscode at module level.
// Tests can mutate `configValues` and `colorThemeKind` to drive resolveSettings().
/** @type {Record<string, unknown>} */
const configValues = {};
const colorThemeState = { kind: 1 };

const Module = /** @type {any} */ (require("node:module"));
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (/** @type {string} */ request, /** @type {any[]} */ ...args) {
	if (request === "vscode") return "vscode";
	return originalResolve.call(this, request, ...args);
};
/** @type {any} */ (require.cache)["vscode"] = {
	id: "vscode", filename: "vscode", loaded: true,
	exports: {
		workspace: {
			getConfiguration: () => ({
				get: (/** @type {string} */ key, /** @type {unknown} */ defaultValue) => (key in configValues ? configValues[key] : defaultValue),
			}),
			onDidChangeTextDocument: () => ({ dispose() {} }),
			onDidChangeConfiguration: () => ({ dispose() {} }),
		},
		window: {
			get activeColorTheme() { return { kind: colorThemeState.kind }; },
			onDidChangeActiveColorTheme: () => ({ dispose() {} }),
		},
		commands: { registerCommand: () => ({ dispose() {} }) },
		ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3 },
		ViewColumn: { Beside: 2 },
	}
};

const { extractMermaidBlocks, hasSlideDelimiter, splitSlides, getSlides, resolveSettings, getWebviewContent } = require("../src/extension");

function resetConfig() {
	for (const k of Object.keys(configValues)) delete configValues[k];
	colorThemeState.kind = 1;
}

describe("extractMermaidBlocks", () => {

	it("extracts a single backtick-fenced mermaid block", () => {
		const input = "# Title\n\n```mermaid\ngraph TD\n  A --> B\n```\n";
		const result = extractMermaidBlocks(input);
		assert.equal(result.length, 1);
		assert.equal(result[0], "graph TD\n  A --> B");
	});

	it("extracts multiple backtick-fenced blocks", () => {
		const input = "```mermaid\ngraph TD\n  A --> B\n```\n\nSome text\n\n```mermaid\nsequenceDiagram\n  Alice->>Bob: Hi\n```\n";
		const result = extractMermaidBlocks(input);
		assert.equal(result.length, 2);
		assert.match(result[0], /graph TD/);
		assert.match(result[1], /sequenceDiagram/);
	});

	it("extracts Azure DevOps triple-colon syntax", () => {
		const input = "::: mermaid\ngraph LR\n  A --> B\n:::\n";
		const result = extractMermaidBlocks(input);
		assert.equal(result.length, 1);
		assert.equal(result[0], "graph LR\n  A --> B");
	});

	it("extracts mixed backtick and Azure DevOps syntax", () => {
		const input = "```mermaid\ngraph TD\n  A --> B\n```\n\n::: mermaid\nsequenceDiagram\n  Alice->>Bob: Hi\n:::\n";
		const result = extractMermaidBlocks(input);
		assert.equal(result.length, 2);
		assert.match(result[0], /graph TD/);
		assert.match(result[1], /sequenceDiagram/);
	});

	it("returns empty array when no mermaid blocks exist", () => {
		const input = "# Just a heading\n\nSome paragraph text.\n";
		const result = extractMermaidBlocks(input);
		assert.deepEqual(result, []);
	});

	it("ignores non-mermaid code fences", () => {
		const input = "```javascript\nconsole.log('hello');\n```\n\n```python\nprint('hi')\n```\n";
		const result = extractMermaidBlocks(input);
		assert.deepEqual(result, []);
	});

	it("skips empty mermaid blocks", () => {
		const input = "```mermaid\n\n```\n\n```mermaid\ngraph TD\n  A --> B\n```\n";
		const result = extractMermaidBlocks(input);
		assert.equal(result.length, 1);
		assert.match(result[0], /graph TD/);
	});

	it("trims whitespace from extracted blocks", () => {
		const input = "```mermaid\n\n  graph TD\n    A --> B\n\n```\n";
		const result = extractMermaidBlocks(input);
		assert.equal(result.length, 1);
		assert.match(result[0], /^graph TD/);
	});

	it("handles empty input", () => {
		assert.deepEqual(extractMermaidBlocks(""), []);
	});

	it("handles Azure DevOps syntax without space before mermaid", () => {
		const input = ":::mermaid\ngraph LR\n  X --> Y\n:::\n";
		const result = extractMermaidBlocks(input);
		assert.equal(result.length, 1);
		assert.match(result[0], /graph LR/);
	});
});

describe("splitSlides (explicit open/close tags)", () => {

	it("extracts content between a single open/close pair", () => {
		const input = "<!-- slide -->\n# Slide 1\nContent here\n<!-- /slide -->";
		const result = splitSlides(input);
		assert.equal(result.length, 1);
		assert.match(result[0], /Slide 1/);
		assert.match(result[0], /Content here/);
	});

	it("extracts multiple explicitly closed slides", () => {
		const input = "<!-- slide -->\n# Slide 1\n<!-- /slide -->\n<!-- slide -->\n# Slide 2\n<!-- /slide -->";
		const result = splitSlides(input);
		assert.equal(result.length, 2);
		assert.match(result[0], /Slide 1/);
		assert.match(result[1], /Slide 2/);
	});

	it("discards content outside pairs (preamble, gaps, trailing)", () => {
		const input = "# Preamble\n<!-- slide -->\n# Slide 1\n<!-- /slide -->\nGap text\n<!-- slide -->\n# Slide 2\n<!-- /slide -->\nTrailing";
		const result = splitSlides(input);
		assert.equal(result.length, 2);
		assert.match(result[0], /Slide 1/);
		assert.doesNotMatch(result[0], /Preamble/);
		assert.match(result[1], /Slide 2/);
		assert.doesNotMatch(result[1], /Gap text/);
		assert.doesNotMatch(result[1], /Trailing/);
	});

	it("implicitly closes a slide at EOF when no closing tag is present", () => {
		const input = "<!-- slide -->\n# Slide 1\n<!-- /slide -->\n<!-- slide -->\n# Slide 2";
		const result = splitSlides(input);
		assert.equal(result.length, 2);
		assert.match(result[1], /Slide 2/);
	});

	it("is case-insensitive on opening and closing tags", () => {
		const input = "<!-- SLIDE -->\nSlide A\n<!-- /SLIDE -->";
		const result = splitSlides(input);
		assert.equal(result.length, 1);
		assert.match(result[0], /Slide A/);
	});

	it("ignores delimiters inside fenced code block", () => {
		const input = "<!-- slide -->\n# Slide 1\n```js\n<!-- /slide -->\n```\n<!-- /slide -->\n<!-- slide -->\n# Slide 2\n<!-- /slide -->";
		const result = splitSlides(input);
		assert.equal(result.length, 2);
		assert.match(result[0], /Slide 1/);
		assert.match(result[1], /Slide 2/);
	});

	it("ignores delimiters inside ::: mermaid block", () => {
		const input = "<!-- slide -->\n# Slide 1\n::: mermaid\ngraph TD\n  A-->B\n<!-- /slide -->\n:::\n<!-- /slide -->";
		const result = splitSlides(input);
		assert.equal(result.length, 1);
		assert.match(result[0], /Slide 1/);
		assert.match(result[0], /graph TD/);
	});

	it("skips empty slides (open immediately followed by close)", () => {
		const input = "<!-- slide -->\n<!-- /slide -->\n<!-- slide -->\n# Real slide\n<!-- /slide -->";
		const result = splitSlides(input);
		assert.equal(result.length, 1);
		assert.match(result[0], /Real slide/);
	});

	it("ignores stray closing tags outside slides", () => {
		const input = "<!-- /slide -->\n<!-- slide -->\n# Slide 1\n<!-- /slide -->\n<!-- /slide -->";
		const result = splitSlides(input);
		assert.equal(result.length, 1);
		assert.match(result[0], /Slide 1/);
	});

	it("does not treat <!-- slide --> as a closing tag anymore", () => {
		const input = "<!-- slide -->\n# Slide 1\n<!-- slide -->\nMore content\n<!-- /slide -->";
		const result = splitSlides(input);
		assert.equal(result.length, 1);
		assert.match(result[0], /Slide 1/);
		assert.match(result[0], /More content/);
	});

	it("returns empty array when no delimiter present", () => {
		const input = "# Just a heading\nSome text.";
		const result = splitSlides(input);
		assert.equal(result.length, 0);
	});

	it("returns empty array for empty input", () => {
		assert.deepEqual(splitSlides(""), []);
	});

	it("skips YAML front matter at start of file", () => {
		const input = "---\ntitle: My Notes\ndate: 2024-01-01\n---\n# Preamble\n<!-- slide -->\n# Slide 1\n<!-- /slide -->";
		const result = splitSlides(input);
		assert.equal(result.length, 1);
		assert.match(result[0], /Slide 1/);
		assert.doesNotMatch(result[0], /title:/);
		assert.doesNotMatch(result[0], /Preamble/);
	});

	it("does not treat --- as a slide delimiter", () => {
		const input = "<!-- slide -->\n# Slide 1\n---\nMore content\n<!-- /slide -->";
		const result = splitSlides(input);
		assert.equal(result.length, 1);
		assert.match(result[0], /Slide 1/);
		assert.match(result[0], /More content/);
	});

});

describe("hasSlideDelimiter", () => {

	it("detects <!-- slide --> in a document", () => {
		assert.equal(hasSlideDelimiter("# Title\n<!-- slide -->\n## Slide 2"), true);
	});

	it("returns false when no delimiter present", () => {
		assert.equal(hasSlideDelimiter("# Title\n---\nsome text"), false);
	});

	it("returns false for empty input", () => {
		assert.equal(hasSlideDelimiter(""), false);
	});

	it("is case-insensitive", () => {
		assert.equal(hasSlideDelimiter("content\n<!-- SLIDE -->\nmore"), true);
	});

	it("does not treat closing tags as the slide-mode signal", () => {
		assert.equal(hasSlideDelimiter("content\n<!-- /slide -->\nmore"), false);
	});

	it("requires delimiter to be on its own line", () => {
		// inline comment should not trigger slide mode
		assert.equal(hasSlideDelimiter("some <!-- slide --> inline text"), false);
	});

});

describe("getSlides", () => {

	it("classic mode: returns one slide per mermaid block when no delimiter", () => {
		const input = "# Heading\n```mermaid\ngraph TD\n  A-->B\n```\ntext\n```mermaid\nsequenceDiagram\n  A->>B: Hi\n```";
		const result = getSlides(input);
		assert.equal(result.length, 2);
		// Each slide should be a mermaid-fence-wrapped string
		assert.match(result[0], /^```mermaid/);
		assert.match(result[0], /graph TD/);
		assert.match(result[1], /sequenceDiagram/);
	});

	it("classic mode: returns empty array for file with no mermaid and no delimiter", () => {
		assert.deepEqual(getSlides("# Just markdown, no diagrams"), []);
	});

	it("slide mode: extracts explicitly closed slides", () => {
		const input = "# Preamble\n<!-- slide -->\n# Slide 1\n```mermaid\ngraph TD\n  A-->B\n```\n<!-- /slide -->\nGap\n<!-- slide -->\n# Slide 2\nParagraph\n<!-- /slide -->";
		const result = getSlides(input);
		assert.equal(result.length, 2);
		assert.match(result[0], /Slide 1/);
		assert.match(result[1], /Slide 2/);
	});

	it("slide mode: discards content outside pairs", () => {
		const input = "<!-- slide -->\n# Title\nSome text.\n<!-- /slide -->\nIgnored gap.\n<!-- slide -->\n## Second\nMore text.\n<!-- /slide -->";
		const result = getSlides(input);
		assert.equal(result.length, 2);
		assert.match(result[0], /Some text/);
		assert.match(result[1], /More text/);
		assert.doesNotMatch(result[0], /Ignored gap/);
	});

	it("slide mode: preserves mermaid-only slides", () => {
		const input = "<!-- slide -->\n# Intro\n<!-- /slide -->\n<!-- slide -->\n```mermaid\ngraph TD\n  A-->B\n```\n<!-- /slide -->";
		const result = getSlides(input);
		assert.equal(result.length, 2);
		assert.match(result[1], /graph TD/);
	});

	it("slide mode: implicitly closes unclosed slide at EOF", () => {
		const input = "# Preamble\n<!-- slide -->\n# Actual slide";
		const result = getSlides(input);
		assert.equal(result.length, 1);
		assert.match(result[0], /Actual slide/);
		assert.doesNotMatch(result[0], /Preamble/);
	});

	it("slide mode: legacy closing tags no longer split slides", () => {
		const input = "<!-- slide -->\n# Intro\n<!-- slide -->\n## Still same slide\n<!-- /slide -->";
		const result = getSlides(input);
		assert.equal(result.length, 1);
		assert.match(result[0], /Intro/);
		assert.match(result[0], /Still same slide/);
	});

});

describe("resolveSettings", () => {

	it("returns defaults when no config is set (Light theme)", () => {
		resetConfig();
		colorThemeState.kind = 1; // Light
		const s = resolveSettings();
		assert.equal(s.mermaidTheme, "default");
		assert.equal(s.showCounter, true);
		assert.equal(s.showNavigationArrows, true);
	});

	it("resolves 'default' mermaid theme to 'dark' on Dark VS Code theme", () => {
		resetConfig();
		colorThemeState.kind = 2; // Dark
		assert.equal(resolveSettings().mermaidTheme, "dark");
	});

	it("resolves 'default' mermaid theme to 'dark' on HighContrast VS Code theme", () => {
		resetConfig();
		colorThemeState.kind = 3; // HighContrast
		assert.equal(resolveSettings().mermaidTheme, "dark");
	});

	it("passes through an explicit mermaid theme override", () => {
		resetConfig();
		configValues["slide.mermaidTheme"] = "forest";
		colorThemeState.kind = 2; // Dark — should be ignored
		assert.equal(resolveSettings().mermaidTheme, "forest");
	});

	it("reads slide.showCounter and slide.showNavigationArrows as booleans", () => {
		resetConfig();
		configValues["slide.showCounter"] = false;
		configValues["slide.showNavigationArrows"] = false;
		const s = resolveSettings();
		assert.equal(s.showCounter, false);
		assert.equal(s.showNavigationArrows, false);
	});

	it("returns defaults for new styling settings when not configured", () => {
		resetConfig();
		const s = resolveSettings();
		assert.equal(s.headingAlignment, "left");
		assert.equal(s.contentAlignment, "left");
		assert.equal(s.fontSize, "medium");
		assert.equal(s.backgroundColor, "");
	});

	it("reads headingAlignment, contentAlignment, fontSize, and backgroundColor", () => {
		resetConfig();
		configValues["slide.headingAlignment"] = "center";
		configValues["slide.contentAlignment"] = "right";
		configValues["slide.fontSize"] = "large";
		configValues["slide.backgroundColor"] = "#1e1e1e";
		const s = resolveSettings();
		assert.equal(s.headingAlignment, "center");
		assert.equal(s.contentAlignment, "right");
		assert.equal(s.fontSize, "large");
		assert.equal(s.backgroundColor, "#1e1e1e");
	});

	it("reads small fontSize setting", () => {
		resetConfig();
		configValues["slide.fontSize"] = "small";
		assert.equal(resolveSettings().fontSize, "small");
	});

});

describe("getWebviewContent", () => {

	const defaultSettings = { mermaidTheme: "default", showCounter: true, showNavigationArrows: true, headingAlignment: "left", contentAlignment: "left", fontSize: "medium", backgroundColor: "" };
	const nonce = "testnonce123";

	it("returns empty-state HTML with 'No slides found' heading when slides array is empty", () => {
		const html = getWebviewContent([], nonce, defaultSettings);
		assert.ok(html.includes("<h2>No slides found</h2>"), "missing h2 heading");
		assert.ok(html.includes("&lt;!-- /slide --&gt;"), "missing explicit closing tag guidance");
		assert.ok(!html.includes("{{CUSTOM_STYLES}}"), "placeholder left unreplaced");
	});

	it("uses a pinned Mermaid runtime URL", () => {
		const html = getWebviewContent(["# Hello"], nonce, defaultSettings);
		assert.ok(html.includes("mermaid@11.14.0"), "missing pinned Mermaid version");
	});

	it("replaces all placeholders when slides are present", () => {
		const html = getWebviewContent(["# Hello"], nonce, defaultSettings);
		assert.ok(!html.includes("{{NONCE}}"), "NONCE placeholder left");
		assert.ok(!html.includes("{{THEME}}"), "THEME placeholder left");
		assert.ok(!html.includes("{{SLIDES_JSON}}"), "SLIDES_JSON placeholder left");
		assert.ok(!html.includes("{{BODY_CLASSES}}"), "BODY_CLASSES placeholder left");
		assert.ok(!html.includes("{{CUSTOM_STYLES}}"), "CUSTOM_STYLES placeholder left");
	});

	it("injects no custom CSS when all settings are at defaults", () => {
		const html = getWebviewContent(["# Hello"], nonce, defaultSettings);
		const stylesMatch = html.match(/\/\* custom \*\/([\s\S]*?)<\/style>/);
		const injected = stylesMatch ? stylesMatch[1].trim() : "";
		assert.equal(injected, "", "expected empty custom styles block");
	});

	it("injects heading alignment CSS for non-default headingAlignment", () => {
		const html = getWebviewContent(["# Hello"], nonce, { ...defaultSettings, headingAlignment: "center" });
		assert.ok(html.includes("text-align: center"), "missing heading alignment rule");
		assert.ok(html.includes(".slide-inner h1"), "missing heading selector");
	});

	it("injects content alignment CSS for non-default contentAlignment", () => {
		const html = getWebviewContent(["# Hello"], nonce, { ...defaultSettings, contentAlignment: "right" });
		assert.ok(html.includes(".slide-inner { text-align: right; }"), "missing content alignment rule");
	});

	it("injects font-size 0.85em for fontSize: small", () => {
		const html = getWebviewContent(["# Hello"], nonce, { ...defaultSettings, fontSize: "small" });
		assert.ok(html.includes("font-size: 0.85em"), "missing small font size rule");
	});

	it("injects font-size 1.25em for fontSize: large", () => {
		const html = getWebviewContent(["# Hello"], nonce, { ...defaultSettings, fontSize: "large" });
		assert.ok(html.includes("font-size: 1.25em"), "missing large font size rule");
	});

	it("injects background color rule when backgroundColor is non-empty", () => {
		const html = getWebviewContent(["# Hello"], nonce, { ...defaultSettings, backgroundColor: "#1e1e1e" });
		assert.ok(html.includes("body { background: #1e1e1e; }"), "missing background color rule");
	});

	it("does not inject background rule when backgroundColor is empty string", () => {
		const html = getWebviewContent(["# Hello"], nonce, defaultSettings);
		assert.ok(!html.includes("body { background:"), "unexpected background rule");
	});

	it("escapes < in SLIDES_JSON to prevent injection", () => {
		const html = getWebviewContent(["<script>alert(1)</script>"], nonce, defaultSettings);
		assert.ok(!html.includes("<script>alert"), "unescaped < in SLIDES_JSON");
		assert.ok(html.includes("\\u003cscript"), "< not unicode-escaped");
	});

	it("adds single-slide body class for a one-slide deck", () => {
		const html = getWebviewContent(["# Only slide"], nonce, defaultSettings);
		assert.ok(html.includes("single-slide"), "missing single-slide class");
	});

	it("adds hide-counter body class when showCounter is false", () => {
		const html = getWebviewContent(["# Slide"], nonce, { ...defaultSettings, showCounter: false });
		assert.ok(html.includes("hide-counter"), "missing hide-counter class");
	});

	it("adds hide-nav body class when showNavigationArrows is false", () => {
		const html = getWebviewContent(["# Slide"], nonce, { ...defaultSettings, showNavigationArrows: false });
		assert.ok(html.includes("hide-nav"), "missing hide-nav class");
	});

});
