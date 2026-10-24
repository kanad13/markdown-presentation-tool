const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

describe("packaged extension", () => {
	// `vsce ls` applies .vscodeignore exactly as `vsce package` does, so this
	// checks the file list users receive without writing a .vsix.
	const result = spawnSync(process.execPath, [path.join(root, "node_modules", "@vscode", "vsce", "vsce"), "ls"], {
		cwd: root,
		encoding: "utf8",
	});
	const files = result.stdout
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);

	it("lists files successfully", () => {
		assert.equal(result.status, 0, result.stderr);
	});

	it("contains the entry point, the webview template, and the icon", () => {
		for (const required of ["package.json", "src/extension.js", "src/webview.html", "assets/icon.png"]) {
			assert.ok(files.includes(required), `${required} missing from package`);
		}
	});

	it("contains no development files", () => {
		const forbidden =
			/^(test\/|scripts\/|docs\/|examples\/|node_modules\/|\.github\/|\.claude\/|eslint\.config|\.prettier|AGENTS\.md|CLAUDE\.md|jsconfig\.json|.*\.vsix$)/;
		assert.deepEqual(
			files.filter((f) => forbidden.test(f)),
			[]
		);
	});

	it("manifest main points at a packaged file", () => {
		assert.ok(files.includes(manifest.main.replace(/^\.\//, "")));
	});
});

describe("manifest policy", () => {
	it("pins @types/vscode to the engine floor", () => {
		const floor = manifest.engines.vscode.replace(/^\^/, "");
		assert.equal(manifest.devDependencies["@types/vscode"], floor);
	});

	it("declares support for untrusted workspaces", () => {
		// The extension runs no code from the opened folder and validates workspace settings,
		// so it stays usable in Restricted Mode.
		assert.deepEqual(manifest.capabilities, { untrustedWorkspaces: { supported: true } });
	});

	it("ships a square icon of at least 128x128 pixels", () => {
		// PNG header: 8-byte signature, then the IHDR chunk with width and height at bytes 16 and 20.
		const png = fs.readFileSync(path.join(root, manifest.icon));
		const width = png.readUInt32BE(16);
		const height = png.readUInt32BE(20);
		assert.equal(width, height);
		assert.ok(width >= 128, "icon is " + width + "px wide");
	});

	it("keeps runtime dependencies empty", () => {
		assert.equal(manifest.dependencies, undefined);
	});
});
