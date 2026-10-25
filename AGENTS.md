# Markdown Presentation Tool - VS Code Extension

Agent instructions for this repository. Humans use the same file: [readme.md](readme.md) describes the product and [docs/development.md](docs/development.md) describes the workflow.

## Guides

- [docs/dependencies.md](docs/dependencies.md): version policy, support floors, and the quarterly review procedure. Read it before changing `package.json`, the lockfile, the Mermaid version, or the CSP.
- [docs/testing.md](docs/testing.md): the map from user workflows to evidence, and the manual checks. Update it when a workflow, contract, surface, or tool changes.
- [docs/decisions.md](docs/decisions.md): reasoned deferrals and rejections. It is context, not a task list. Nothing in it is scheduled.
- [docs/workflows.md](docs/workflows.md): the procedure and stopping point for each kind of request.
- [docs/sibling-extensions.md](docs/sibling-extensions.md): the other extensions published as KunalPathak, and the files they share.
- [docs/architecture.md](docs/architecture.md): how slides are extracted and rendered.
- [docs/development.md](docs/development.md): setup, daily checks, CI, and the release process.

## Key context

This extension presents Markdown as a navigable slideshow in a VS Code webview. The entry point is `getSlides()` in `src/extension.js`, which selects one of two modes.

- **Slide mode** (the file contains `<!-- slide -->`): `<!-- slide -->` opens a slide and `<!-- /slide -->` closes it.
  - Only content inside open/close pairs becomes a slide. Text outside pairs is ignored.
  - A slide still open at end of file closes implicitly. Empty slides are skipped.
- **Mermaid-only mode** (no `<!-- slide -->`): one Mermaid diagram per slide, all other text discarded. It keeps files written for the original `mermaid-slideshow` extension working.

Both modes share one renderer, `renderMarkdownToHtml` in `src/webview.html`.

## Task routing

Match the maintainer's request to a workflow in [docs/workflows.md](docs/workflows.md) and run it. Stop at the stopping point that the workflow names. The workflow column must equal a heading in that guide; `test/docs.test.js` checks it.

| If the maintainer says...                                                    | Run workflow             |
| :--------------------------------------------------------------------------- | :----------------------- |
| "Evaluate adding X", "Is X worth it?", "Add a dependency"                    | Evaluate a Change        |
| "Add X", "Implement X" (after approval)                                      | Build an Approved Change |
| "Update", "upgrade", "maintain", "dependency review", "is the repo current?" | Maintain and Upgrade     |
| "X is broken", "fix this bug"                                                | Fix a Defect             |
| "Release", "publish", "ship it"                                              | Release                  |
| "Check for drift", "sync the repo", "are the docs accurate?"                 | Sync and Audit           |
| "Update the docs", "rewrite the README"                                      | Change Documentation     |
| "Do the other extensions need this?", "share this change", "check the sibling extensions" | Share With Sibling Extensions |

- **No match:**
  - A question about the code or the docs gets an answer and no file changes.
  - Any other request that matches no row or several rows: name the closest workflow and ask the maintainer to confirm it.
- **Evidence:**
  - Verify claims about libraries, store rules, and behavior against the code, a command's output, or primary documentation.
  - Report a check as passed only if you ran it.
- **Shared files:**
  - After you change a file listed in [docs/sibling-extensions.md](docs/sibling-extensions.md), run Share With Sibling Extensions before you finish.

## Architecture rules

- All extension logic lives in `src/extension.js`. The webview template is `src/webview.html`.
- One webview panel, reused across files.
- No TypeScript, no frameworks, no bundled webview scripts, no runtime dependencies.
- `getSlides()` is the only slide-extraction entry point. `activate()` never calls `extractMermaidBlocks()` or `splitSlides()` directly.
- Slide delimiters are HTML comments alone on a line, case-insensitive. Never use `---`: it conflicts with Markdown `<hr>` and YAML front matter.
- Two Mermaid syntaxes work inside slides: backtick fences and Azure DevOps `:::` fences.
- State lives in closures inside `activate()`. No classes, no globals.
- Mermaid loads from the CDN through a dynamic `import()` so a failed load disables diagrams only. The version is the `MERMAID_VERSION` constant in `src/extension.js`; no other file repeats it.
- Template placeholders are substituted in one pass by `getWebviewContent()`. Setting values pass through allow-lists before they reach CSS or script.
- The Content Security Policy stays strict. Do not loosen it to silence a console message.

## Code style

- Prettier and ESLint agree: tabs, double quotes, semicolons, Unix line endings, ES2020, CommonJS.
- JSDoc on all exported and public functions.
- Comments explain why. No TODO comments in code; track work in issues.
- `src/webview.html` and Markdown are outside Prettier's scope.

## Git and commits

- Work on a feature branch, never on `main`.
- Commit in logical groups (dependencies, code, tests, documentation, version). Each commit message states the problem, the solution, and the reasons for non-obvious decisions.
- Push, tag, merge, and publish only when the maintainer says so.
- Add no `Co-Authored-By` trailers and no tool or model attribution to commits, pull requests, files, or release notes.

## Multi-file change protocol

After an edit that touches several files, align code, tests, and documents before committing.

1. Run `npm test`. It runs the unit tests, the Prettier check, and ESLint.
2. Update the affected guide: `docs/testing.md` for workflows and evidence, `docs/architecture.md` for mechanisms, `docs/dependencies.md` for policy.
3. Check every relative link in the Markdown files you touched.
4. Record a consequential design choice or deferral in `docs/decisions.md`.

## Testing rules

- `npm test` is the one verification command. CI runs the same command on the lowest Node version in `package.json`.
- A bug fix ships with a regression test that fails without the fix.
- Check each new test by breaking the behavior and confirming the test fails.
- Never weaken an assertion to get a green run.
- Test fakes live in `test/support/`.
- Render changes need a browser check with `scripts/render-harness.js` (see [docs/testing.md](docs/testing.md)).

## Packaging

`.vscodeignore` keeps development files out of the package, and `test/package.test.js` verifies the file list. Add a new development file or directory to `.vscodeignore` in the same change.
