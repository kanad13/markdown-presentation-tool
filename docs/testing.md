# Testing Guide

This guide maps each user workflow to its evidence and lists the manual checks that remain. It is the canonical description of how the project is verified. Update it when a workflow, a contract, a surface, or a tool changes.

Related guides: [development.md](development.md) for the daily commands, [architecture.md](architecture.md) for the mechanisms under test, and [dependencies.md](dependencies.md) for the review that triggers the render checks.

## Overview

Verification has three layers, each crossing a different boundary.

| Layer                 | Boundary it crosses                                                       | Command or procedure                      |
| :-------------------- | :------------------------------------------------------------------------ | :---------------------------------------- |
| Automated             | Source and the shipped webview template, fake editor API, packaged file list | `npm test`                                |
| Browser harness       | The generated page in a real browser, including the Mermaid CDN load      | `node scripts/render-harness.js`          |
| Installed extension   | The `.vsix` in a real editor                                              | Manual smoke check below                  |

`npm test` runs three steps in order: the unit tests (`node --test "test/*.test.js"`), the Prettier check, and ESLint. CI runs the same command on the lowest Node version named in `package.json`, followed by the production audit.

## Workflow map

Each row names a workflow a user performs, the evidence that protects it, and any gap.

| Workflow                                   | Evidence                                                                                                          | Remaining gap                                   |
| :----------------------------------------- | :---------------------------------------------------------------------------------------------------------------- | :---------------------------------------------- |
| Open a deck in slide mode                  | `splitSlides` and `getSlides` tests in `test/extension.test.js`                                                   | None                                            |
| Open a Mermaid-only file                   | `extractMermaidBlocks` and `getSlides` tests, including mixed-syntax document order                              | None                                            |
| Run the command on a bad target            | `test/lifecycle.test.js`: no editor and non-Markdown cases show an error and open no panel                        | None                                            |
| Reuse the panel for another file           | `test/lifecycle.test.js`: one panel, re-targeted, reveal called                                                   | None                                            |
| Edit while presenting                      | `test/lifecycle.test.js`: debounce window, latest text wins, other documents ignored                              | Real typing latency (manual)                    |
| Close the panel or deactivate mid-edit     | `test/lifecycle.test.js`: pending timer cancelled, no post to a disposed panel                                    | None                                            |
| Switch tabs while editing                  | `test/lifecycle.test.js`: hidden panel is not messaged and re-renders on becoming visible                         | Real tab restore behavior (manual)              |
| Change a setting or theme                  | `test/lifecycle.test.js`: re-render with new CSS and Mermaid theme                                                | Visual result (harness)                         |
| Hostile setting values                     | `test/extension.test.js`: allow-lists and the color sanitizer                                                     | None                                            |
| Hostile slide text                         | `test/webview.test.js` (escaping), `test/extension.test.js` (placeholders and `$` patterns, `<` in JSON)          | None                                            |
| Read rendered Markdown                     | `test/webview.test.js` runs the shipped renderer block                                                            | Visual styling (harness)                        |
| See diagrams                               | Harness: every example deck, light and dark                                                                       | Automated browser test is not built             |
| Present with the CDN unreachable           | Harness with an unreachable version; template test that the import is dynamic                                     | Manual                                          |
| Keep the slide position across reloads     | `test/lifecycle.test.js`: the document key reaches the generated page; `test/extension.test.js`: key escaping      | `getState`/`setState` in a real webview (manual) |
| Install the package                        | `test/package.test.js`: `vsce ls` shows required files and no development files                                   | Install in a real editor (manual)               |

## Commands

- **Full check:**
  - `npm test` runs the unit tests, the format check, and the linter.
  - `npm run format` rewrites JavaScript and JSON with the repository's Prettier configuration.
- **Lowest Node:**
  - Run `npm test` under the `engines.node` floor before a release. Glob handling and runner behavior differ between Node versions.
  - CI always does this.
- **Single suite:**
  - `node --test test/webview.test.js` runs one file.

## Test design rules

- **Shipped code:**
  - The renderer lives in its own DOM-free `<script id="renderer">` block of `src/webview.html`. `test/webview.test.js` evaluates that block, so tests exercise the code users run.
- **Fakes:**
  - `test/support/vscode-stub.js` holds the one fake of the `vscode` module. It models panel visibility, disposal, and event listeners.
  - The fake panel throws on `postMessage` after disposal, as the real API does.
- **Time:**
  - Lifecycle tests use `node:test` mock timers. No test sleeps.
- **Sabotage check:**
  - After adding a test, break the behavior on purpose and confirm the test fails. Restore the code afterward.
  - Redundant guards can hide a break. The dispose test passes under a single removed guard because the panel, document, and timer checks each stop the stray update.
- **Assertions:**
  - Never relax an assertion to obtain a green run. Fix the implementation.

## Browser harness procedure

The harness serves the exact page that the extension generates, with a stand-in for the webview API and VS Code theme colors.

1. Run `node scripts/render-harness.js`. It listens on `localhost:8765` and prints a URL.
2. Open `http://localhost:8765/?file=examples/02-slide-mode-basics.md&theme=dark` in a browser. Use `theme=light` for the light palette. Optional parameters: `backgroundColor`, `fontSize`, `headingAlignment`, `contentAlignment`.
3. Step through every slide with the arrow keys. Every diagram renders and the console shows no errors.
4. Repeat for each file in `examples/` in both themes.
5. To check the offline path, change `MERMAID_VERSION` temporarily to a version that does not exist, restart the harness, and confirm that text slides render and each diagram slide shows a note with the source. Restore the constant afterward.

Run this procedure whenever `MERMAID_VERSION`, the Content Security Policy, the renderer, or the stylesheet changes.

## Installed-extension smoke check

Run this before each release, on the package built from the final commit.

1. Run `npm run package` and install the file with `code --install-extension <file>.vsix`.
2. Reload the window, open `examples/02-slide-mode-basics.md`, and run **Markdown: Show Markdown Presentation**.
3. Check the first slide, arrow-key navigation, the counter, and a diagram.
4. Edit text in the source and confirm that the slide updates.
5. Switch to another editor tab, edit the source, switch back, and confirm that the slide shows the edit and the same slide index.
6. Change the `markdownPresentation.slide.fontSize` setting while on a later slide and confirm that the slide index stays the same.
7. Switch the VS Code color theme between light and dark and confirm that the diagram theme follows.
8. Set `markdownPresentation.slide.backgroundColor` to `#102040` and confirm the slide background changes. Set it to an invalid value and confirm the editor background returns.
9. Run `code --uninstall-extension KunalPathak.markdown-presentation-tool`.

## Triggers

| Change                                           | Required evidence                                    |
| :----------------------------------------------- | :--------------------------------------------------- |
| Any source or test edit                          | `npm test`                                           |
| Renderer, stylesheet, CSP, or `MERMAID_VERSION`  | Browser harness procedure                            |
| `package.json`, `.vscodeignore`, or the manifest | `npm test` (package suite)                           |
| Release candidate                                | `npm test` on the lowest Node, smoke check, `npm audit --omit=dev` |
