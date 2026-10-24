const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");

const { host, resetVscode, makeDocument, configValues, colorThemeState } = require("./support/vscode-stub");
const { activate } = require("../src/extension");

const COMMAND = "markdownPresentation.showPreview";
const DEBOUNCE_MS = 300;

const DECK_A = "<!-- slide -->\n# Alpha\n<!-- /slide -->";
const DECK_B = "<!-- slide -->\n# Beta\n<!-- /slide -->";

/** @returns {{subscriptions: {dispose(): void}[]}} */
function activateExtension() {
	const context = { subscriptions: [] };
	activate(/** @type {any} */ (context));
	return context;
}

function presentationOf(/** @type {ReturnType<typeof makeDocument>} */ doc) {
	host.activeTextEditor = { document: doc };
	host.commands[COMMAND]();
	return host.panels[host.panels.length - 1];
}

/** @param {ReturnType<typeof makeDocument>} doc */
function editDocument(doc, /** @type {string} */ text) {
	doc.setText(text);
	host.textListeners.forEach((cb) => cb({ document: doc }));
}

describe("showPreview command", () => {
	beforeEach(() => {
		resetVscode();
		mock.method(console, "log", () => {});
		mock.timers.enable({ apis: ["setTimeout"] });
	});
	afterEach(() => {
		mock.timers.reset();
		mock.restoreAll();
	});

	it("reports an error and creates no panel when there is no active editor", () => {
		activateExtension();
		host.commands[COMMAND]();
		assert.deepEqual(host.errors, ["No active editor"]);
		assert.equal(host.panels.length, 0);
	});

	it("reports an error and creates no panel for a non-Markdown document", () => {
		activateExtension();
		host.activeTextEditor = { document: makeDocument("x", "file:///a.txt", "plaintext") };
		host.commands[COMMAND]();
		assert.deepEqual(host.errors, ["Not a Markdown file"]);
		assert.equal(host.panels.length, 0);
	});

	it("creates a panel whose HTML carries the slides and the document key", () => {
		activateExtension();
		const panel = presentationOf(makeDocument(DECK_A, "file:///a.md"));
		assert.equal(host.panels.length, 1);
		assert.ok(panel.webview.html.includes("# Alpha"));
		assert.ok(panel.webview.html.includes('"file:///a.md"'));
	});

	it("reuses the single panel and re-targets it to the newly shown file", () => {
		activateExtension();
		presentationOf(makeDocument(DECK_A, "file:///a.md"));
		const panel = presentationOf(makeDocument(DECK_B, "file:///b.md"));
		assert.equal(host.panels.length, 1);
		assert.equal(panel.revealCount, 1);
		assert.ok(panel.webview.html.includes("# Beta"));
		assert.ok(panel.webview.html.includes('"file:///b.md"'));
	});

	it("recreates the panel after it was disposed", () => {
		activateExtension();
		presentationOf(makeDocument(DECK_A)).dispose();
		presentationOf(makeDocument(DECK_A));
		assert.equal(host.panels.length, 2);
	});
});

describe("live update", () => {
	beforeEach(() => {
		resetVscode();
		mock.method(console, "log", () => {});
		mock.timers.enable({ apis: ["setTimeout"] });
	});
	afterEach(() => {
		mock.timers.reset();
		mock.restoreAll();
	});

	it("sends one message with the latest text after the debounce window", () => {
		activateExtension();
		const doc = makeDocument(DECK_A);
		const panel = presentationOf(doc);

		editDocument(doc, DECK_A.replace("Alpha", "A1"));
		mock.timers.tick(DEBOUNCE_MS - 100);
		editDocument(doc, DECK_A.replace("Alpha", "A2"));
		mock.timers.tick(DEBOUNCE_MS - 1);
		assert.equal(panel.messages.length, 0, "message sent before the debounce elapsed");

		mock.timers.tick(1);
		assert.equal(panel.messages.length, 1);
		assert.deepEqual(panel.messages[0], { type: "update", slides: ["# A2"] });
	});

	it("ignores edits to a document that is not being presented", () => {
		activateExtension();
		const panel = presentationOf(makeDocument(DECK_A, "file:///a.md"));
		editDocument(makeDocument(DECK_B, "file:///other.md"), DECK_B);
		mock.timers.tick(DEBOUNCE_MS);
		assert.equal(panel.messages.length, 0);
	});

	it("cancels a pending update when the panel is disposed", () => {
		activateExtension();
		const doc = makeDocument(DECK_A);
		const panel = presentationOf(doc);
		editDocument(doc, DECK_B);
		panel.dispose();
		// The fake panel throws on postMessage after disposal, so a stray timer fails here.
		mock.timers.tick(DEBOUNCE_MS);
		assert.equal(panel.messages.length, 0);
	});

	it("drops a pending update that belongs to the previously shown file", () => {
		activateExtension();
		const docA = makeDocument(DECK_A, "file:///a.md");
		const panel = presentationOf(docA);
		editDocument(docA, DECK_A.replace("Alpha", "Stale"));
		presentationOf(makeDocument(DECK_B, "file:///b.md"));
		mock.timers.tick(DEBOUNCE_MS);
		assert.equal(panel.messages.length, 0, "stale text from file A reached the panel");
	});

	it("cancels a pending update when the extension is deactivated", () => {
		const context = activateExtension();
		const doc = makeDocument(DECK_A);
		const panel = presentationOf(doc);
		editDocument(doc, DECK_B);
		context.subscriptions.forEach((s) => s.dispose());
		mock.timers.tick(DEBOUNCE_MS);
		assert.equal(panel.messages.length, 0);
	});

	it("does not message a hidden panel and re-renders it when it becomes visible", () => {
		activateExtension();
		const doc = makeDocument(DECK_A);
		const panel = presentationOf(doc);
		const assignmentsBefore = panel.htmlAssignments;

		panel.setVisible(false);
		editDocument(doc, DECK_A.replace("Alpha", "Edited"));
		mock.timers.tick(DEBOUNCE_MS);
		assert.equal(panel.messages.length, 0, "message posted to a hidden webview would be lost");

		panel.setVisible(true);
		assert.equal(panel.htmlAssignments, assignmentsBefore + 1);
		assert.ok(panel.webview.html.includes("# Edited"));
	});

	it("does not reload the page when it becomes visible with nothing missed", () => {
		activateExtension();
		const panel = presentationOf(makeDocument(DECK_A));
		const assignmentsBefore = panel.htmlAssignments;
		panel.setVisible(false);
		panel.setVisible(true);
		assert.equal(panel.htmlAssignments, assignmentsBefore);
	});
});

describe("settings and theme changes", () => {
	beforeEach(() => {
		resetVscode();
		mock.method(console, "log", () => {});
		mock.timers.enable({ apis: ["setTimeout"] });
	});
	afterEach(() => {
		mock.timers.reset();
		mock.restoreAll();
	});

	it("re-renders the panel when a markdownPresentation setting changes", () => {
		activateExtension();
		const panel = presentationOf(makeDocument(DECK_A));
		const before = panel.htmlAssignments;
		configValues["slide.contentAlignment"] = "center";
		host.configListeners.forEach((cb) =>
			cb({ affectsConfiguration: (/** @type {string} */ s) => s === "markdownPresentation" })
		);
		assert.equal(panel.htmlAssignments, before + 1);
		assert.ok(panel.webview.html.includes(".slide-inner { text-align: center; }"));
	});

	it("ignores configuration changes in other sections", () => {
		activateExtension();
		const panel = presentationOf(makeDocument(DECK_A));
		const before = panel.htmlAssignments;
		host.configListeners.forEach((cb) => cb({ affectsConfiguration: () => false }));
		assert.equal(panel.htmlAssignments, before);
	});

	it("re-renders with the matching Mermaid theme when the color theme changes", () => {
		activateExtension();
		const panel = presentationOf(makeDocument(DECK_A));
		assert.ok(panel.webview.html.includes("theme: 'default'"));
		colorThemeState.kind = 2;
		host.themeListeners.forEach((cb) => cb());
		assert.ok(panel.webview.html.includes("theme: 'dark'"));
	});

	it("does nothing when settings change before any panel exists", () => {
		activateExtension();
		assert.doesNotThrow(() => {
			host.configListeners.forEach((cb) => cb({ affectsConfiguration: () => true }));
			host.themeListeners.forEach((cb) => cb());
		});
	});
});
