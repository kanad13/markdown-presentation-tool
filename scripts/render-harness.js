/**
 * Local browser harness for the slideshow webview.
 *
 * Serves the exact HTML that the extension generates for a markdown file, with
 * a stand-in for the VS Code webview API and theme variables, so the renderer
 * and the Mermaid CDN load can be checked in any browser (see docs/testing.md).
 *
 * Usage: node scripts/render-harness.js [port]
 * Open:  http://localhost:<port>/?file=examples/02-slide-mode-basics.md&theme=dark
 *
 * The harness is a development aid. It is excluded from the packaged extension.
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
// extension.js requires "vscode" at load time; the shared test fake satisfies it,
// and only the pure functions are used here.
require("../test/support/vscode-stub");

const { getSlides, getWebviewContent, getNonce } = require("../src/extension");

const ROOT = path.join(__dirname, "..");

const THEME_VARIABLES = {
	light: "--vscode-editor-background:#ffffff;--vscode-editor-foreground:#333333;--vscode-textCodeBlock-background:#dcdcdc66;--vscode-descriptionForeground:#717171;--vscode-editorWidget-background:#f3f3f3;--vscode-focusBorder:#0090f1;--vscode-list-hoverBackground:#e8e8e8;--vscode-errorForeground:#a1260d;",
	dark: "--vscode-editor-background:#1e1e1e;--vscode-editor-foreground:#cccccc;--vscode-textCodeBlock-background:#0a0a0a66;--vscode-descriptionForeground:#9d9d9d;--vscode-editorWidget-background:#252526;--vscode-focusBorder:#007fd4;--vscode-list-hoverBackground:#2a2d2e;--vscode-errorForeground:#f48771;",
};

/**
 * Builds the harness page for one markdown file.
 *
 * @param {string} relativeFile - Markdown path relative to the repository root
 * @param {"light"|"dark"} theme - Which VS Code theme variables to emulate
 * @param {Record<string, string>} overrides - Setting overrides, e.g. backgroundColor
 * @returns {string} Complete HTML page
 */
function buildPage(relativeFile, theme, overrides) {
	const filePath = path.resolve(ROOT, relativeFile);
	if (!filePath.startsWith(ROOT + path.sep)) {
		throw new Error("file must be inside the repository");
	}
	const slides = getSlides(fs.readFileSync(filePath, "utf8"));
	const nonce = getNonce();
	const settings = Object.assign(
		{
			mermaidTheme: theme === "dark" ? "dark" : "default",
			showCounter: true,
			showNavigationArrows: true,
			headingAlignment: "left",
			contentAlignment: "left",
			fontSize: "medium",
			backgroundColor: "",
		},
		overrides
	);
	const html = getWebviewContent(slides, nonce, settings, "file://" + filePath);
	const shim = `<style>:root{${THEME_VARIABLES[theme]}}</style>
<script nonce="${nonce}">(function(){var s;window.acquireVsCodeApi=function(){return{getState:function(){return s;},setState:function(v){s=v;window.__state=v;},postMessage:function(){}};};})();</script>`;
	return html.replace("</head>", shim + "\n</head>");
}

const port = Number(process.argv[2]) || 8765;
http.createServer((req, res) => {
	const url = new URL(req.url || "/", "http://localhost");
	try {
		const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
		const overrides = {};
		for (const key of ["backgroundColor", "fontSize", "headingAlignment", "contentAlignment"]) {
			const value = url.searchParams.get(key);
			if (value !== null) overrides[key] = value;
		}
		const page = buildPage(url.searchParams.get("file") || "examples/02-slide-mode-basics.md", theme, overrides);
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
		res.end(page);
	} catch (error) {
		res.writeHead(400, { "Content-Type": "text/plain" });
		res.end(String(error && error.message));
	}
}).listen(port, "127.0.0.1", () => {
	console.log("Render harness: http://localhost:" + port + "/?file=examples/02-slide-mode-basics.md&theme=dark");
});
