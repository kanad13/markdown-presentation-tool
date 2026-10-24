# Architecture

This guide describes how the Markdown Presentation Tool turns a Markdown file into a slideshow. It starts with the whole system, then follows one slide through each stage, then covers edge cases and design decisions.

Related guides: [development.md](development.md) for setup and releases, [testing.md](testing.md) for the evidence behind each mechanism, [dependencies.md](dependencies.md) for version and support policy, and [decisions.md](decisions.md) for features that are intentionally not built.

## Overview

The extension has two source files and no runtime dependencies.

| Component              | File                | Job                                                                                       |
| :--------------------- | :------------------ | :---------------------------------------------------------------------------------------- |
| Extension host module  | `src/extension.js`  | Reads the document, extracts slides, validates settings, builds the page, manages the panel |
| Webview template       | `src/webview.html`  | Renders slides, loads Mermaid, handles navigation                                         |

The flow for one presentation:

1. The user runs the command on a Markdown file.
2. `getSlides()` returns an array of slide strings, one Markdown string per slide.
3. `getWebviewContent()` fills the template with the slides, settings, and a fresh security nonce, and the panel loads the result.
4. The webview renders the current slide, asks Mermaid to draw diagrams, and handles navigation.
5. Edits to the source file reach the webview as `update` messages. Changes to settings or the color theme replace the page.

## Slide extraction

`getSlides()` is the only extraction entry point. It detects the mode from the file content.

| Condition                                    | Mode               | Function called          | Result                                          |
| :------------------------------------------- | :----------------- | :----------------------- | :---------------------------------------------- |
| A line contains only `<!-- slide -->`        | Slide mode         | `splitSlides()`          | One slide per open/close pair                   |
| No such line                                 | Mermaid-only mode  | `extractMermaidBlocks()` | One slide per diagram, in document order        |

Mermaid-only mode keeps files written for the original `mermaid-slideshow` extension working. It discards all text around the diagrams.

### Slide mode rules

- **Pairs:**
  - `<!-- slide -->` opens a slide and `<!-- /slide -->` closes it. Both match case-insensitively and sit alone on a line.
  - Content outside a pair is discarded: preamble, notes between slides, and trailing text.
- **Edge cases:**
  - A slide still open at end of file closes implicitly.
  - Empty slides are skipped.
  - Stray closing tags and repeated opening tags are ignored.
  - Delimiters inside fenced code blocks (triple backticks or `::: mermaid`) are ignored.
  - A leading YAML front matter block is removed before processing.

### Mermaid syntaxes

Two fence syntaxes work in both modes: backtick fences (```` ```mermaid ````) and Azure DevOps fences (`::: mermaid`). `extractMermaidBlocks()` finds both in one regex pass, so diagrams keep their document order.

## Webview rendering

The template holds two scripts and one stylesheet.

- **Renderer script:**
  - A classic `<script id="renderer">` block defines `escapeHtml`, `renderInline`, and `renderMarkdownToHtml`. It touches no DOM, so tests evaluate the shipped code directly.
  - `renderMarkdownToHtml` handles headings, paragraphs, flat lists, blockquotes, horizontal rules, fenced code, Mermaid fences, and images that sit alone on a line.
  - Every text fragment passes through `escapeHtml` before it enters markup. Diagram source is escaped too, so it stays text until Mermaid reads it.
- **Module script:**
  - Holds slide state, navigation, the message handler, and the Mermaid loader.
- **Stylesheet:**
  - Uses VS Code theme variables so slides follow the editor theme. The `{{CUSTOM_STYLES}}` placeholder carries rules for settings that differ from the defaults.

### Template substitution

`getWebviewContent()` replaces every `{{PLACEHOLDER}}` in one regex pass with a replacer function.

- **Why one pass:**
  - Slide text is user content. A second pass could expand placeholder-like text inside a slide.
  - A replacer function avoids the special meaning of `$&`, `$'`, and `$$` in replacement strings.
- **JSON values:**
  - Slides and the document key go through `JSON.stringify` with `<` escaped as `<`, so they cannot close the script element.

### Mermaid loading

- **Source:**
  - The module imports Mermaid from jsDelivr with a dynamic `import()`. The version is the `MERMAID_VERSION` constant in `src/extension.js`.
- **Isolation:**
  - A failed load shows a note and the diagram source on that slide. Text slides, navigation, and live update keep working.
  - Each diagram renders on its own, so one syntax error leaves the others intact.
- **Configuration:**
  - The module sets `startOnLoad` and `theme` only. The library default applies for everything else, including `securityLevel`, which is `strict`.

### Content Security Policy

| Directive      | Value                                             | Reason                                                  |
| :------------- | :------------------------------------------------ | :------------------------------------------------------ |
| `default-src`  | `'none'`                                          | Deny everything not listed                              |
| `script-src`   | the page nonce and the exact Mermaid directory    | Only this page's scripts and one pinned package version run |
| `style-src`    | `'unsafe-inline'`                                 | Mermaid and the settings block inject inline styles     |
| `img-src`      | `https:` and `data:`                              | Remote images and inline data URIs                      |
| `base-uri`     | `'none'`                                          | Block base-tag rewrites                                 |
| `form-action`  | `'none'`                                          | No form posts                                           |

The nonce comes from `crypto.randomBytes` and changes on every render.

### Image support

- **Supported:**
  - `![alt](https://...)` alone on a line renders as an image that fits the slide viewport.
- **Limits:**
  - Only `https:` URLs render. Other schemes and local paths do not.
  - A URL that contains a literal `)` ends at the first `)`. Percent-encode the parenthesis as `%28` or `%29`.
  - Images inside a paragraph are not matched.

## Settings pipeline

1. `resolveSettings()` reads every `markdownPresentation.*` key and returns one object. It resolves the Mermaid theme: `default` follows the editor's light or dark kind.
2. Allow-lists check enumerated values (`pickOption`) and the background color (`sanitizeColor`). A rejected value becomes the default. VS Code does not enforce manifest enums on hand-edited values, and workspace settings come from the opened folder.
3. `getWebviewContent()` turns non-default values into a small CSS block. Default settings produce no extra CSS.

## Workspace Trust

The manifest declares support for untrusted workspaces, so the extension stays enabled in Restricted Mode. It runs no code from the opened folder. Slide text is escaped, and workspace setting values pass the allow-lists described above, so a hostile folder cannot change the page's script or fetch resources through CSS.

## Panel lifecycle

`activate()` keeps one panel and the document it shows in closure variables.

- **Command:**
  - The command validates the active editor, cancels any pending update, points the panel at the document, and renders the page.
- **Live update:**
  - `onDidChangeTextDocument` starts a 300 ms debounce. When it fires, the extension posts the new slides to the webview.
  - The debounce is cancelled on panel disposal, on deactivation, and when the panel switches to another file.
- **Hidden panel:**
  - VS Code destroys a hidden webview and restores it from `webview.html`. A message sent meanwhile is lost.
  - The extension records a missed edit and replaces the page when the panel becomes visible.
- **Settings and theme:**
  - A change to any `markdownPresentation.*` setting, or to the color theme, replaces the page through the same render helper.
- **Slide position:**
  - The webview stores the slide index with `setState`, keyed by the document URI. A reload restores the position only for the same file.

## Design decisions

| Decision                         | Reason                                                                                                   |
| :------------------------------- | :------------------------------------------------------------------------------------------------------- |
| No TypeScript                    | One module with simple shapes. Plain JavaScript keeps the toolchain small.                               |
| No bundler                       | Two source files need no build step.                                                                     |
| No runtime dependencies          | Mermaid loads in the webview from the CDN. The extension uses Node built-ins and the VS Code API.        |
| Closure-based state              | Panel, document, and timer state live inside `activate()`. No classes, no globals.                        |
| Explicit open/close delimiters   | Pairs make boundaries obvious and let authors keep notes in the same file.                               |
| HTML comments as delimiters      | `---` collides with horizontal rules and YAML front matter. Comments are invisible in other renderers.   |
| Dynamic Mermaid import           | A failed CDN load disables diagrams only.                                                                |
| Pinned, scoped CDN script        | An exact version and a directory-scoped `script-src` limit executed code to one published package.       |

## Key files

| File                         | Purpose                                                                                       |
| :--------------------------- | :-------------------------------------------------------------------------------------------- |
| `src/extension.js`           | Activation, extraction, settings, template building, panel lifecycle                          |
| `src/webview.html`           | Renderer, Mermaid loader, navigation, styles                                                  |
| `test/*.test.js`             | Unit, lifecycle, renderer, package, and documentation tests                                   |
| `test/support/vscode-stub.js`| Shared fake of the `vscode` module                                                            |
| `scripts/render-harness.js`  | Local page server for browser checks                                                          |
| `examples/`                  | Decks for manual and harness checks                                                           |
