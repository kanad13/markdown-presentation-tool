const crypto = require("crypto");
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const OPEN_SLIDE_DELIMITER = /^<!--\s*slide\s*-->\s*$/i;
const CLOSE_SLIDE_DELIMITER = /^<!--\s*\/slide\s*-->\s*$/i;

/**
 * Extracts Mermaid diagram code blocks from raw markdown text.
 *
 * Supports two syntaxes:
 * - Backtick style: ```mermaid ... ```
 * - Azure DevOps / Fenced Div style: ::: mermaid ... :::
 *
 * Operates on raw text via regex - no markdown parsing required.
 *
 * @param {string} rawText - Raw markdown file content
 * @returns {string[]} Array of Mermaid diagram code strings (trimmed)
 */
function extractMermaidBlocks(rawText) {
	const blocks = [];

	// Backtick style: ```mermaid ... ```
	const backtickRegex = /```mermaid\s*\n([\s\S]*?)```/g;
	let match;
	while ((match = backtickRegex.exec(rawText)) !== null) {
		const code = match[1].trim();
		if (code) {
			blocks.push(code);
		}
	}

	// Azure DevOps style: ::: mermaid ... :::
	const colonRegex = /:::\s*mermaid\s*\n([\s\S]*?):::/g;
	while ((match = colonRegex.exec(rawText)) !== null) {
		const code = match[1].trim();
		if (code) {
			blocks.push(code);
		}
	}

	return blocks;
}

/**
 * Detects whether a markdown document contains slide delimiters.
 *
 * A slide document is detected by the presence of an opening delimiter line
 * containing only <!-- slide --> (case-insensitive, optional surrounding
 * whitespace). Files without it use the classic mermaid-only path.
 *
 * @param {string} rawText - Raw markdown file content
 * @returns {boolean} True if at least one slide delimiter is present
 */
function hasSlideDelimiter(rawText) {
	if (!rawText) {
		return false;
	}

	return rawText.split(/\r?\n/).some(function (line) {
		return OPEN_SLIDE_DELIMITER.test(line);
	});
}

/**
 * Splits a markdown document into logical slides using explicit open/close tags.
 *
 * Opening tags use <!-- slide --> and closing tags use <!-- /slide -->
 * (case-insensitive). Only content inside an open/close pair becomes a slide.
 * Content outside any pair (preamble, gaps between pairs, trailing text after
 * a close) is ignored. This lets authors keep notes, titles, or documentation
 * in the same file without it appearing in the slideshow.
 *
 * If the file ends while a slide is still open, the open slide is implicitly
 * closed at EOF.
 *
 * Delimiters inside fenced code blocks (``` or ::: mermaid) are ignored.
 * Empty slides (open immediately followed by close) are skipped. Stray closing
 * tags and nested opening tags are ignored outside their expected positions.
 *
 * A leading YAML front matter block (line 0 = "---", closed by "---" or "...")
 * is detected and excluded from slide content.
 *
 * @param {string} rawText - Raw markdown file content
 * @returns {string[]} Array of per-slide markdown strings
 */
function splitSlides(rawText) {
	if (!rawText) {
		return [];
	}

	const lines = rawText.split(/\r?\n/);
	let startLine = 0;

	// Skip YAML front matter if present (file starts with ---)
	if (/^---\s*$/.test(lines[0])) {
		for (let j = 1; j < lines.length; j++) {
			if (/^---\s*$/.test(lines[j]) || /^\.\.\.\s*$/.test(lines[j])) {
				startLine = j + 1;
				break;
			}
		}
	}

	const slides = [];
	let current = [];
	let insideFence = false;
	let insideColonMermaid = false;
	let insideSlide = false;

	for (let i = startLine; i < lines.length; i++) {
		const line = lines[i];

		// Track triple-backtick code fences (any language)
		if (/^```/.test(line)) {
			insideFence = !insideFence;
			if (insideSlide) {
				current.push(line);
			}
			continue;
		}

		// Track Azure DevOps style mermaid fences ::: mermaid ... :::
		if (!insideFence && /^:::\s*mermaid/.test(line)) {
			insideColonMermaid = true;
			if (insideSlide) {
				current.push(line);
			}
			continue;
		}
		if (insideColonMermaid && /^:::\s*$/.test(line)) {
			insideColonMermaid = false;
			if (insideSlide) {
				current.push(line);
			}
			continue;
		}

		// Slide delimiters are only recognized outside of fenced blocks
		if (!insideFence && !insideColonMermaid) {
			if (!insideSlide && OPEN_SLIDE_DELIMITER.test(line)) {
				current = [];
				insideSlide = true;
				continue;
			}

			if (insideSlide && CLOSE_SLIDE_DELIMITER.test(line)) {
				const slideText = current.join("\n").trim();
				if (slideText) {
					slides.push(slideText);
				}
				current = [];
				insideSlide = false;
				continue;
			}

			if (CLOSE_SLIDE_DELIMITER.test(line) || OPEN_SLIDE_DELIMITER.test(line)) {
				continue;
			}
		}

		if (insideSlide) {
			current.push(line);
		}
		// Lines outside an open slide pair are silently discarded
	}

	// If file ends with an unclosed slide, treat EOF as implicit close
	if (insideSlide) {
		const last = current.join("\n").trim();
		if (last) {
			slides.push(last);
		}
	}

	return slides;
}

/**
 * Returns slides for a document, auto-detecting the appropriate mode.
 *
 * Slide mode (<!-- slide --> opening delimiter present): splits by explicit
 * <!-- /slide --> closing tags, and each slide is raw markdown that may
 * contain text and Mermaid blocks.
 *
 * Classic mode (no delimiter): extracts only Mermaid diagram blocks,
 * one per slide, identical to pre-slide-mode behaviour. Each block is
 * wrapped in a mermaid fence so the webview's unified renderer handles
 * both modes with the same code path.
 *
 * @param {string} rawText - Raw markdown file content
 * @returns {string[]} Array of slide strings (markdown)
 */
function getSlides(rawText) {
	if (hasSlideDelimiter(rawText)) {
		return splitSlides(rawText);
	}
	return extractMermaidBlocks(rawText).map(function (d) {
		return "```mermaid\n" + d + "\n```";
	});
}

/**
 * Generates a random nonce for Content Security Policy.
 *
 * @returns {string} Random 32-character hex string
 */
function getNonce() {
	return crypto.randomBytes(16).toString("hex");
}

/**
 * Reads user-configurable settings and resolves derived values.
 *
 * Returns an object with:
 * - mermaidTheme: the effective Mermaid theme. When the user setting is
 *   "default", auto-detects VS Code's color theme kind and returns "dark"
 *   for dark/high-contrast themes, "default" for light themes. Explicit
 *   user choices (dark, forest, neutral) are returned as-is.
 * - showCounter: whether the slide counter should be visible.
 * - showNavigationArrows: whether the on-screen prev/next arrows should be visible.
 * - headingAlignment: text-align value for h1–h6 headings ("left", "center", "right").
 * - contentAlignment: overall text-align for slide body content ("left", "center", "right").
 * - fontSize: base font size tier for slide content ("small", "medium", "large").
 * - backgroundColor: CSS color string for slide background; empty string defers to VS Code theme.
 *
 * @returns {{mermaidTheme: string, showCounter: boolean, showNavigationArrows: boolean, headingAlignment: string, contentAlignment: string, fontSize: string, backgroundColor: string}}
 */
function resolveSettings() {
	const cfg = vscode.workspace.getConfiguration("markdownPresentation");
	const themeSetting = cfg.get("slide.mermaidTheme", "default");
	const kind = vscode.window.activeColorTheme.kind;
	const isDark = kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
	const mermaidTheme = themeSetting === "default" ? (isDark ? "dark" : "default") : themeSetting;
	return {
		mermaidTheme,
		showCounter: cfg.get("slide.showCounter", true),
		showNavigationArrows: cfg.get("slide.showNavigationArrows", true),
		headingAlignment: cfg.get("slide.headingAlignment", "left"),
		contentAlignment: cfg.get("slide.contentAlignment", "left"),
		fontSize: cfg.get("slide.fontSize", "medium"),
		backgroundColor: cfg.get("slide.backgroundColor", ""),
	};
}

/**
 * Generates the slideshow webview HTML from a template file.
 *
 * Reads src/webview.html and replaces placeholder tokens with runtime values.
 * Returns an empty-state page when no slides are found.
 *
 * Supports both classic mode (one Mermaid diagram per slide) and slide mode
 * (mixed markdown and Mermaid content per slide, split by <!-- slide --> / <!-- /slide --> delimiters).
 *
 * @param {string[]} slides - Array of slide strings (raw markdown)
 * @param {string} nonce - CSP nonce token
 * @param {{mermaidTheme: string, showCounter: boolean, showNavigationArrows: boolean, headingAlignment: string, contentAlignment: string, fontSize: string, backgroundColor: string}} settings - Resolved user settings
 * @returns {string} Complete HTML page
 */
function getWebviewContent(slides, nonce, settings) {
	if (slides.length === 0) {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
	<title>Markdown Presentation</title>
	<style>
		body {
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100vh;
			margin: 0;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			color: var(--vscode-descriptionForeground);
			background: var(--vscode-editor-background);
		}
		.empty { text-align: center; }
		.empty h2 { font-size: 1.6em; margin-bottom: 12px; color: var(--vscode-editor-foreground); }
		.empty p { font-size: 1.4em; margin: 8px 0; }
		.empty code { font-family: 'Courier New', Courier, monospace; background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.2)); padding: 2px 6px; border-radius: 3px; }
	</style>
</head>
<body>
	<div class="empty">
		<h2>No slides found</h2>
		<p>This file doesn't contain any presentation slides.</p>
		<p>Wrap slide content with <code>&lt;!-- slide --&gt;</code> and <code>&lt;!-- /slide --&gt;</code>,<br>
		or include Mermaid code blocks for automatic diagram slides.</p>
	</div>
</body>
</html>`;
	}

	const templatePath = path.join(__dirname, "webview.html");
	let html = fs.readFileSync(templatePath, "utf8");

	const bodyClasses = [
		slides.length === 1 ? "single-slide" : "",
		settings.showCounter ? "" : "hide-counter",
		settings.showNavigationArrows ? "" : "hide-nav",
	]
		.filter(Boolean)
		.join(" ");

	const fontSizeMap = /** @type {Record<string, string>} */ ({ small: "0.85em", medium: "1em", large: "1.25em" });
	const customStyleRules = [];
	if (settings.headingAlignment !== "left") {
		customStyleRules.push(`.slide-inner h1, .slide-inner h2, .slide-inner h3,
		.slide-inner h4, .slide-inner h5, .slide-inner h6 { text-align: ${settings.headingAlignment}; }`);
	}
	if (settings.contentAlignment !== "left") {
		customStyleRules.push(`.slide-inner { text-align: ${settings.contentAlignment}; }`);
	}
	if (settings.fontSize !== "medium") {
		customStyleRules.push(`.slide-inner { font-size: ${fontSizeMap[settings.fontSize] ?? "1em"}; }`);
	}
	if (settings.backgroundColor) {
		customStyleRules.push(`body { background: ${settings.backgroundColor}; }`);
	}
	const customStyles = customStyleRules.join("\n		");

	html = html.replace(/\{\{NONCE\}\}/g, nonce);
	html = html.replace("{{THEME}}", settings.mermaidTheme);
	html = html.replace("{{SLIDES_JSON}}", JSON.stringify(slides).replace(/</g, "\\u003c"));
	html = html.replace("{{BODY_CLASSES}}", bodyClasses);
	html = html.replace("{{CUSTOM_STYLES}}", customStyles);

	return html;
}

/**
 * Sends updated slides to the webview via postMessage.
 *
 * @param {vscode.WebviewPanel} panel - The webview panel
 * @param {string[]} slides - Updated array of slide strings (raw markdown)
 */
function postSlidesUpdate(panel, slides) {
	panel.webview.postMessage({
		type: "update",
		slides: slides,
	});
}

/**
 * Activation function - called when the extension loads.
 *
 * Registers the "Show Markdown Presentation Preview" command and manages
 * a single webview panel that displays slides as a navigable slideshow.
 * Supports two modes: classic (one Mermaid diagram per slide) and slide
 * mode (mixed markdown and Mermaid content split by <!-- slide --> / <!-- /slide --> delimiters).
 *
 * @param {vscode.ExtensionContext} context - Extension context provided by VS Code
 */
function activate(context) {
	console.log("markdownPresentation extension activated");

	/** @type {import("vscode").WebviewPanel | undefined} */
	let currentPanel = undefined;
	/** @type {import("vscode").TextDocument | undefined} */
	let currentDocument = undefined;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let debounceTimer = undefined;

	const disposable = vscode.commands.registerCommand("markdownPresentation.showPreview", function () {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No active editor");
			return;
		}

		const doc = editor.document;
		if (doc.languageId !== "markdown") {
			vscode.window.showErrorMessage("Not a Markdown file");
			return;
		}

		const slides = getSlides(doc.getText());
		const settings = resolveSettings();
		const nonce = getNonce();

		if (currentPanel) {
			currentPanel.reveal(vscode.ViewColumn.Beside);
			currentDocument = doc;
			currentPanel.webview.html = getWebviewContent(slides, nonce, settings);
		} else {
			currentPanel = vscode.window.createWebviewPanel(
				"markdownPresentation",
				"Markdown Presentation",
				vscode.ViewColumn.Beside,
				{ enableScripts: true }
			);

			currentDocument = doc;
			currentPanel.webview.html = getWebviewContent(slides, nonce, settings);

			currentPanel.onDidDispose(
				() => {
					currentPanel = undefined;
					currentDocument = undefined;
				},
				null,
				context.subscriptions
			);
		}
	});

	// Live-update preview when source file changes (debounced)
	const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
		if (currentPanel && currentDocument && e.document.uri.toString() === currentDocument.uri.toString()) {
			const panel = currentPanel;
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				const slides = getSlides(e.document.getText());
				postSlidesUpdate(panel, slides);
			}, 300);
		}
	});

	// Re-render webview when any Markdown Presentation setting changes
	const changeConfigSubscription = vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration("markdownPresentation") && currentPanel && currentDocument) {
			const settings = resolveSettings();
			const nonce = getNonce();
			const slides = getSlides(currentDocument.getText());
			currentPanel.webview.html = getWebviewContent(slides, nonce, settings);
		}
	});

	// Re-render when VS Code color theme changes (affects auto-detected Mermaid theme)
	const changeColorThemeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
		if (currentPanel && currentDocument) {
			const settings = resolveSettings();
			const nonce = getNonce();
			const slides = getSlides(currentDocument.getText());
			currentPanel.webview.html = getWebviewContent(slides, nonce, settings);
		}
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(changeDocumentSubscription);
	context.subscriptions.push(changeConfigSubscription);
	context.subscriptions.push(changeColorThemeSubscription);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate,
	extractMermaidBlocks,
	hasSlideDelimiter,
	splitSlides,
	getSlides,
	resolveSettings,
	getWebviewContent,
};
