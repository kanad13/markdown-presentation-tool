# Markdown Presentation Tool - VS Code Extension

## Repository

This is the `markdown-presentation-tool` repository. All development happens on `main`.

**Key files:**
- `src/extension.js` — all extension logic
- `src/webview.html` — webview renderer with markdown-to-HTML and Mermaid support
- `test/extension.test.js` — unit tests
- `docs/development.md` — development, CI, and release workflow

---

## Key Context

This extension presents markdown content as a navigable slideshow in a VS Code webview. The entry point is `getSlides()` in `src/extension.js`, which auto-detects the extraction mode:

**Slide mode** (file contains `<!-- slide -->`): `<!-- slide -->` opens a slide and `<!-- /slide -->` closes it. Only content inside open/close pairs becomes a slide. Content outside pairs (preamble, notes between slides, trailing text) is ignored. If the file ends with a slide still open, EOF acts as implicit close. Empty slides are skipped.

**Mermaid-only mode** (no `<!-- slide -->` in the file): Backward-compatible path from the original `mermaid-slideshow` extension. Extracts only Mermaid diagram blocks, one per slide. All surrounding markdown text is discarded.

Both modes share the same webview renderer (`renderMarkdownToHtml` in `src/webview.html`).

- Single source file: `src/extension.js`
- No runtime dependencies — Mermaid loaded via CDN in webview
- Closure-based state (no classes, no globals)
- CSP nonce security on all webview renders

---

## Architecture Rules

- All extension logic in `src/extension.js`
- Single webview panel, reused across files
- No TypeScript, no frameworks, no bundled webview scripts
- Mermaid CDN: `https://cdn.jsdelivr.net/npm/mermaid@11.14.0/dist/mermaid.esm.min.mjs`
- `getSlides()` is the single entry point for slide extraction — never call `extractMermaidBlocks()` or `splitSlides()` directly from `activate()`
- Slide delimiters: `<!-- slide -->` opens and `<!-- /slide -->` closes (HTML comments on their own lines, case-insensitive)
- Do NOT use `---` as a slide delimiter — it conflicts with Markdown `<hr>` and YAML front matter
- Two Mermaid syntaxes supported inside slides: backtick (` ```mermaid `) and Azure DevOps (`:::`)

---

## Code Style (enforced by ESLint)

- Tabs, double quotes, semicolons, Unix line endings
- ES2020, CommonJS (`require`/`module.exports`)
- JSDoc on all exported/public functions
- No TODO comments in code — track in issues

---

## Git Commits

Commit at regular intervals. Include detailed comments on why changes were made (e.g. to fix which issues, to implement what features, etc.)
