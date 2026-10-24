/**
 * Shared fake of the `vscode` module for unit tests.
 *
 * extension.js requires "vscode" at load time, and that module exists only
 * inside the editor host. One fake serves every suite so behavior such as
 * event ordering, panel visibility and disposal is modeled in one place.
 * Each test file runs in its own process, so state here is never shared
 * between files; within a file, call resetVscode() in a beforeEach.
 */
const Module = /** @type {any} */ (require("node:module"));

/** @type {Record<string, unknown>} */
const configValues = {};
const colorThemeState = { kind: 1 };

/** @type {{commands: Record<string, Function>, textListeners: Function[], configListeners: Function[], themeListeners: Function[], panels: FakePanel[], errors: string[], activeTextEditor: any}} */
const host = {
	commands: {},
	textListeners: [],
	configListeners: [],
	themeListeners: [],
	panels: [],
	errors: [],
	activeTextEditor: undefined,
};

class FakePanel {
	constructor() {
		this.visible = true;
		this.disposed = false;
		/** @type {unknown[]} */
		this.messages = [];
		this.revealCount = 0;
		this.htmlAssignments = 0;
		this._html = "";
		/** @type {Function[]} */
		this.disposeListeners = [];
		/** @type {Function[]} */
		this.viewStateListeners = [];
		const panel = this;
		this.webview = {
			get html() {
				return panel._html;
			},
			set html(value) {
				panel._html = value;
				panel.htmlAssignments++;
			},
			postMessage(/** @type {unknown} */ message) {
				// The real API rejects once the panel is gone; mirror that so a
				// stray timer firing after disposal fails the test.
				if (panel.disposed) throw new Error("Webview is disposed");
				panel.messages.push(message);
				return Promise.resolve(true);
			},
		};
	}
	reveal() {
		this.revealCount++;
	}
	onDidDispose(/** @type {Function} */ cb, /** @type {unknown} */ _thisArg, /** @type {{dispose(): void}[]} */ subs) {
		this.disposeListeners.push(cb);
		if (subs) subs.push({ dispose() {} });
		return { dispose() {} };
	}
	onDidChangeViewState(/** @type {Function} */ cb) {
		this.viewStateListeners.push(cb);
		return { dispose() {} };
	}
	dispose() {
		this.disposed = true;
		this.disposeListeners.forEach((cb) => cb());
	}
	/** Simulates the tab moving to the background or foreground. */
	setVisible(/** @type {boolean} */ visible) {
		this.visible = visible;
		this.viewStateListeners.forEach((cb) => cb({ webviewPanel: this }));
	}
}

const vscodeFake = {
	workspace: {
		getConfiguration: () => ({
			get: (/** @type {string} */ key, /** @type {unknown} */ defaultValue) =>
				key in configValues ? configValues[key] : defaultValue,
		}),
		onDidChangeTextDocument: (/** @type {Function} */ cb) => {
			host.textListeners.push(cb);
			return { dispose() {} };
		},
		onDidChangeConfiguration: (/** @type {Function} */ cb) => {
			host.configListeners.push(cb);
			return { dispose() {} };
		},
	},
	window: {
		get activeColorTheme() {
			return { kind: colorThemeState.kind };
		},
		get activeTextEditor() {
			return host.activeTextEditor;
		},
		onDidChangeActiveColorTheme: (/** @type {Function} */ cb) => {
			host.themeListeners.push(cb);
			return { dispose() {} };
		},
		showErrorMessage: (/** @type {string} */ message) => {
			host.errors.push(message);
		},
		createWebviewPanel: () => {
			const panel = new FakePanel();
			host.panels.push(panel);
			return panel;
		},
	},
	commands: {
		registerCommand: (/** @type {string} */ id, /** @type {Function} */ fn) => {
			host.commands[id] = fn;
			return { dispose() {} };
		},
	},
	ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3 },
	ViewColumn: { Beside: 2 },
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (/** @type {string} */ request, /** @type {any[]} */ ...args) {
	if (request === "vscode") return "vscode";
	return originalResolve.call(this, request, ...args);
};
/** @type {any} */ (require.cache)["vscode"] = { id: "vscode", filename: "vscode", loaded: true, exports: vscodeFake };

/** Clears configuration, theme and host state so each test starts clean. */
function resetVscode() {
	for (const k of Object.keys(configValues)) delete configValues[k];
	colorThemeState.kind = 1;
	host.commands = {};
	host.textListeners = [];
	host.configListeners = [];
	host.themeListeners = [];
	host.panels = [];
	host.errors = [];
	host.activeTextEditor = undefined;
}

/**
 * Builds a minimal TextDocument.
 *
 * @param {string} text - Document content; mutate via the returned setText
 * @param {string} [uri] - Document URI string
 * @param {string} [languageId] - VS Code language id
 * @returns {{uri: {toString(): string}, languageId: string, getText(): string, setText(t: string): void}} Fake document
 */
function makeDocument(text, uri = "file:///deck.md", languageId = "markdown") {
	let current = text;
	return {
		uri: { toString: () => uri },
		languageId,
		getText: () => current,
		setText(t) {
			current = t;
		},
	};
}

module.exports = { configValues, colorThemeState, host, FakePanel, resetVscode, makeDocument };
