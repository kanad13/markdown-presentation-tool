# Decision Log

This log records ideas that were evaluated and not built, with the reason and the condition that would reopen each one. It is context, not a backlog. Nothing in it is scheduled, and a verdict is not a promise.

Related guides: [architecture.md](architecture.md) for the design these decisions protect, [testing.md](testing.md) for the evidence a built feature would need, and [dependencies.md](dependencies.md) for the support policy that some entries cite.

## How to read an entry

- **Verdicts:**
  - Pursue: worth doing as proposed.
  - Scoped pursue: worth doing in a bounded form.
  - Counter-proposal: the problem is real and a lighter answer exists.
  - Defer: the value is real but marginal against today's cost.
  - Reject: the cost stays higher than the return.
- **Terms:**
  - The webview is the panel that shows slides. Its renderer turns Markdown text into HTML with a small parser inside `src/webview.html`.
  - A fence is a block that starts and ends with three backticks (or `:::` for the Azure DevOps style).

## Summary

| Idea                                    | Verdict            | Reopen when                                                     |
| :-------------------------------------- | :----------------- | :-------------------------------------------------------------- |
| Workspace Trust declaration             | Scoped pursue      | The maintainer confirms the supported audience                  |
| Links in slide text                     | Defer              | A maintainer or user asks for clickable links                   |
| Tables                                  | Scoped pursue      | Users report tables as the top gap                              |
| Nested lists and task lists             | Defer              | A user deck needs a second list level                           |
| Local (workspace) images                | Scoped pursue      | Users ask to present decks that use relative image paths        |
| Longer or tilde code fences             | Defer              | A deck that documents slide syntax needs it                     |
| Bundling Mermaid for offline use        | Reject             | A user group needs air-gapped presenting                        |
| Removing the `onLanguage:markdown` event | Defer             | Start-up cost is measured and matters                           |
| Browser-driven automated tests          | Defer              | Renderer regressions escape the unit tests twice                |
| Presenter mode, notes, export           | Reject             | A concrete presenting workflow cannot be met otherwise          |
| Settings for Mermaid layout and look    | Reject             | The library's defaults stop fitting VS Code themes              |

## Entries

### Workspace Trust declaration

- **What it is:**
  - VS Code opens unfamiliar folders in Restricted Mode. An extension that does not declare support for that mode is disabled there, so the presentation button disappears until the user trusts the folder.
  - The `capabilities.untrustedWorkspaces` field in `package.json` can declare that the extension is safe in Restricted Mode.
- **Why it is not done:**
  - Declaring support changes who can use the extension in which state. That decision belongs to the maintainer.
- **Why it is probably safe:**
  - The extension runs no code from the opened folder. Slide text is escaped, and setting values pass allow-lists, so a hostile workspace settings file cannot change the page's script or fetch resources through CSS.
  - The one outbound path is image and Mermaid loading, which happens in trusted and untrusted folders alike.
- **Reopen when:**
  - The maintainer confirms the audience. The change is one manifest field plus a testing-guide row.

### Links in slide text

- **What it is:**
  - Rendering `[text](https://...)` as a clickable link.
- **Why it costs more than it returns today:**
  - A click in a webview needs a message to the extension host, which opens the URL in the system browser. That adds a message channel, a scheme allow-list, and tests for each.
  - Slides rarely need clickable links during a live presentation.
- **Reopen when:**
  - Presenters ask for links, or a deck format that depends on them becomes common.

### Tables

- **What it is:**
  - Rendering pipe tables as HTML tables.
- **Why it is scoped rather than rejected:**
  - Tables are common in technical decks, and the renderer shows them as plain text lines today.
  - A table parser must handle alignment rows, escaped pipes, and ragged rows, and it needs a width strategy for narrow panels.
- **Scope if pursued:**
  - Header row, separator row, body rows, column alignment. No spans, no nested Markdown beyond inline formatting.
- **Reopen when:**
  - Users report tables as the most missed feature.

### Nested lists and task lists

- **What it is:**
  - Indented list items as child lists, and `- [ ]` items as checkboxes.
- **Why it costs more than it returns today:**
  - The renderer processes one line at a time and keeps only a flat list state. Nesting needs an indentation stack and the matching close-tag logic, which is the point where the line parser starts to need a real Markdown parser.
- **Reopen when:**
  - A second list level is needed often enough to justify a parser change. A bundled parser library conflicts with the rule against bundled webview scripts, so that route needs its own evaluation.

### Local images

- **What it is:**
  - Showing `![](./diagram.png)` with a path relative to the Markdown file.
- **Why it costs more than it returns today:**
  - The extension must resolve the path against the document folder, convert it with `asWebviewUri`, set `localResourceRoots`, add `cspSource` to `img-src`, and repeat the rewrite on the live-update path.
  - Windows path separators and images inside code samples add edge cases.
- **Reopen when:**
  - Users ask for it. The work is bounded and testable with the lifecycle fake.

### Longer or tilde code fences

- **What it is:**
  - Markdown lets a fence use four or more backticks, or `~~~`, so a code sample can contain a three-backtick fence.
  - Both the extractor and the renderer toggle on any line that starts with three backticks. A sample wrapped in four backticks that contains a three-backtick fence ends early.
- **Why it is deferred:**
  - It affects only decks that show Markdown syntax inside a slide. The fix needs the same fence-length rule in two places and tests for both.
- **Reopen when:**
  - A deck that documents slide syntax (this extension's own README example, for instance) needs to be presented.

### Bundling Mermaid for offline use

- **What it is:**
  - Shipping Mermaid inside the package so diagrams render without a network.
- **Why it is rejected:**
  - Mermaid's runtime files are far larger than the rest of the extension. Bundling breaks the "no bundled webview scripts" rule, enlarges every install, and moves the update burden into every release.
  - A failed load already degrades gracefully: text slides keep working and each diagram slide shows its source.
- **Reopen when:**
  - A user group must present on an air-gapped machine.

### Removing the `onLanguage:markdown` activation event

- **What it is:**
  - The event starts the extension whenever a Markdown file opens. The command and the title-bar button also start it on use, so the event may be redundant.
- **Why it is deferred:**
  - The saving is the start-up work of a small module, and removing the event risks a missed activation path.
- **Reopen when:**
  - Start-up cost is measured and matters.

### Browser-driven automated tests

- **What it is:**
  - Running the harness page in a headless browser as part of `npm test`.
- **Why it is deferred:**
  - A browser dependency adds a large download, a platform-specific install, and flake risk in CI. The manual harness procedure plus unit tests of the renderer cover the same ground today.
- **Reopen when:**
  - A renderer or diagram regression escapes the unit tests twice.

### Presenter mode, speaker notes, export

- **What it is:**
  - A second window with notes, fragment reveals, or PDF export.
- **Why it is rejected:**
  - Each needs its own window or file pipeline. The extension's purpose is a lightweight in-editor slideshow, and notes can already live outside slide tags in the source file.
- **Reopen when:**
  - A specific presenting workflow cannot be met by the current design.

### Settings for Mermaid layout and look

- **What it is:**
  - Exposing the library's layout engine, look, or theme internals as extension settings.
- **Why it is rejected:**
  - The dependency policy keeps library visual defaults. Each setting adds a surface to test and document and ties the extension to one library version's option names.
- **Reopen when:**
  - The library defaults stop fitting VS Code themes.
