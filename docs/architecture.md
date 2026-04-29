# Architecture

Technical architecture of the Markdown Presentation Tool VS Code extension.

## Overview

Markdown Presentation Tool is a VS Code extension that presents markdown content as a navigable slideshow in a webview panel. Users wrap sections of their markdown file with `<!-- slide -->` opening tags and `<!-- /slide -->` closing tags, and each pair's content becomes one slide with full markdown rendering — headings, paragraphs, lists, blockquotes, code blocks, and Mermaid diagrams.

## Repository History

This extension originated from the `mermaid-slideshow` extension. The original extension only extracted Mermaid diagram blocks and ignored all other markdown content. The `markdown-presentation-tool` extension is a fundamentally different product — it renders full markdown slides with mixed content. It was separated into its own repository to give it an independent release history, issues tracker, and CI pipeline.

## Slide Extraction Pipeline

The single entry point is `getSlides()` in `src/extension.js`. It auto-detects which extraction path to use:

### Slide mode (file contains `<!-- slide -->` opening tags)

Handled by `splitSlides()`. Slide tags work as explicit open/close pairs:

1. `<!-- slide -->` opens a slide and `<!-- /slide -->` closes it.
2. Content outside any open/close pair is discarded (preamble, gaps between pairs, trailing text after a close).
3. If the file ends with a slide still open, EOF acts as an implicit close.
4. Empty slides (open immediately followed by close) are skipped.
5. Delimiters inside fenced code blocks (`` ``` `` or `::: mermaid`) are ignored.
6. YAML front matter (`---` at line 0, closed by `---` or `...`) is stripped before processing.
7. Stray closing tags and repeated opening tags outside their expected positions are ignored.

This lets authors keep notes, documentation, and metadata in the same file without it appearing in the slideshow.

### Mermaid-only mode (no `<!-- slide -->` opening tags)

Handled by `extractMermaidBlocks()`. This is the backward-compatible path from the original `mermaid-slideshow` extension. It extracts only Mermaid code blocks (backtick `` ```mermaid `` and Azure DevOps `::: mermaid` syntax), wraps each in a Mermaid fence, and returns one slide per diagram. All surrounding markdown text is discarded.

This mode exists so that files written for the original Mermaid-only extension continue to work without modification.

### Detection logic

`hasSlideDelimiter()` checks whether the file contains at least one `<!-- slide -->` opening tag on its own line (case-insensitive). If yes, slide mode is used. If no, mermaid-only mode is used.

## Webview Rendering

The webview is a single HTML file (`src/webview.html`) that handles both modes through the same code path:

1. **Template injection** — `getWebviewContent()` reads `src/webview.html` and replaces placeholder tokens (`{{NONCE}}`, `{{THEME}}`, `{{SLIDES_JSON}}`, `{{BODY_CLASSES}}`, `{{CUSTOM_STYLES}}`) with runtime values.
2. **Markdown-to-HTML** — `renderMarkdownToHtml()` is a lightweight inline parser in the webview that handles headings, paragraphs, lists (ordered/unordered), blockquotes, horizontal rules, inline formatting (bold, italic, code), fenced code blocks, Mermaid fences, and remote images.
3. **Mermaid rendering** — Mermaid is loaded via CDN (`https://cdn.jsdelivr.net/npm/mermaid@11.14.0/dist/mermaid.esm.min.mjs`). After the markdown parser emits `<pre class="mermaid">` elements, `mermaid.run()` renders them to SVG.
4. **CSP nonce** — Every webview render generates a fresh cryptographic nonce injected into the Content Security Policy header. Only scripts with the matching nonce can execute.

### Settings Pipeline

User-configurable settings flow through a single pipeline on every render:

1. `resolveSettings()` reads all `markdownPresentation.*` configuration keys and returns a typed settings object. It also resolves derived values (e.g. the effective Mermaid theme when the user has chosen `default`).
2. The settings object is passed to `getWebviewContent()`, which builds a `{{CUSTOM_STYLES}}` CSS block from any non-default values (heading alignment, content alignment, font size, background color).
3. The CSS block is injected into the webview's `<style>` section via the `{{CUSTOM_STYLES}}` placeholder, overriding the base styles only where the user has deviated from defaults.

This means default settings produce zero extra CSS — the base stylesheet is unchanged — and non-default settings produce minimal, targeted overrides.

### Image Support

The webview CSP includes `img-src https: data:`, so images with `https://` URLs render inline. `renderMarkdownToHtml()` matches standalone image lines of the form `![alt](https://...)` and emits `<img>` tags. Images are constrained to fit the slide viewport (`max-width: 100%`, `max-height: calc(100vh - 200px)`, `object-fit: contain`) — no scrolling or panning is required.

**Current limitation — inline images:** Only images that occupy their own line are matched. Images embedded mid-paragraph alongside other text are not yet rendered.

**Current limitation — parentheses in URLs:** The regex uses `[^)]+` to capture the URL, so URLs containing a literal `)` character (e.g. Wikipedia links like `https://en.wikipedia.org/wiki/Foo_(bar)`) will be truncated at the first `)`. Workaround: use a URL shortener or percent-encode the parentheses (`%28`, `%29`).

**Pending — local image support:** Local workspace images (e.g. `![](./assets/diagram.png)`) currently render as blank. Supporting them requires: resolving paths against the markdown file's directory; rewriting each path to a webview-safe URI via `panel.webview.asWebviewUri()`; setting `localResourceRoots` on the panel; and using the runtime `panel.webview.cspSource` value in the CSP `img-src` directive. The live-update (`postSlidesUpdate`) code path also needs URI rewriting. Windows path separators and images inside code blocks (documentation examples) add further edge cases. This is a medium-complexity change (~60–80 lines) — implement as a dedicated feature after a thorough evaluation.

## Live Update Mechanism

When the source document changes in the editor:

1. `onDidChangeTextDocument` fires.
2. A 300ms debounce timer prevents excessive re-renders during rapid typing.
3. After the debounce, `getSlides()` re-extracts slides from the current document text.
4. The updated slides are sent to the webview via `postMessage({ type: 'update', slides })`.
5. The webview receives the message, replaces its slide array, and re-renders the current slide (clamping the index if slides were removed).

The webview is also fully re-rendered (not just updated via message) when:
- The user changes any `markdownPresentation.*` setting.
- The VS Code color theme changes (which affects the auto-detected Mermaid theme).

## Key Files

| File | Purpose |
| --- | --- |
| `src/extension.js` | All extension logic: activation, slide extraction (`getSlides`, `splitSlides`, `extractMermaidBlocks`), webview panel management, live update wiring |
| `src/webview.html` | Webview renderer: markdown-to-HTML parser, Mermaid CDN initialization, slide navigation UI, keyboard/mouse handlers |
| `test/extension.test.js` | Unit tests for slide extraction logic (uses Node.js built-in test runner) |
| `examples/01-classic-mode.md` | Mermaid-only test file (no slide delimiters, backward-compat testing) |
| `examples/02-slide-mode-basics.md` | Happy-path slide mode examples — mixed content and both fence syntaxes |
| `examples/03-slide-mode-advanced.md` | Slide mode edge cases — preamble, gaps, empty pairs, tall slide scroll |

## Design Decisions

| Decision | Rationale |
| --- | --- |
| No TypeScript | Single-file extension with no complex type hierarchies. Plain JS keeps the build toolchain minimal. |
| No bundler | Only one source file (`extension.js`) and one template (`webview.html`). No need for webpack/esbuild. |
| No runtime dependencies | Mermaid is loaded via CDN in the webview, not bundled. The extension itself uses only Node.js built-ins and the VS Code API. |
| Closure-based state | Panel, document, and timer state are held in closures inside `activate()`. No classes, no globals. |
| Explicit open/close delimiters | `<!-- slide -->` / `<!-- /slide -->` pairs make slide boundaries obvious and let authors keep notes and documentation outside slides in the same file. |
| HTML comments, not `---` | `---` conflicts with Markdown horizontal rules and YAML front matter. HTML comments are unambiguous and invisible in normal markdown rendering. |
| Backward-compat mermaid-only mode | Files without `<!-- slide -->` fall back to extracting Mermaid blocks only, preserving compatibility with the original `mermaid-slideshow` extension. |
