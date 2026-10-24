# Development Guide

This guide covers setup, daily checks, continuous integration, and the release process for the Markdown Presentation Tool. Mechanisms are in [architecture.md](architecture.md), verification in [testing.md](testing.md), version policy in [dependencies.md](dependencies.md), and deliberate omissions in [decisions.md](decisions.md). Agents read [AGENTS.md](../AGENTS.md).

## Key source files

| File                          | Purpose                                                                        |
| :---------------------------- | :----------------------------------------------------------------------------- |
| `src/extension.js`            | All extension logic: activation, slide extraction, settings, panel management  |
| `src/webview.html`            | Webview template: renderer, Mermaid loader, navigation, styles                 |
| `test/*.test.js`              | Unit, lifecycle, renderer, and package tests (Node's built-in runner)          |
| `test/support/vscode-stub.js` | The shared fake of the `vscode` module                                         |
| `scripts/render-harness.js`   | Local page server for browser checks                                           |
| `examples/01-classic-mode.md` | Mermaid-only file (no slide delimiters)                                        |
| `examples/02-slide-mode-basics.md` | Slide mode happy path: text and diagrams, both fence syntaxes            |
| `examples/03-slide-mode-advanced.md` | Slide mode edge cases: preamble, gaps, empty pairs, a tall slide          |
| `examples/04-demo-script.md`  | Walkthrough content for demos and manual testing                               |

## Prerequisites

- **Local development:**
  - Node.js at the `engines.node` floor in `package.json`, or newer
  - npm
  - VS Code
  - `gh` CLI, to trigger releases from the terminal
- **Repository secrets:**
  - `VSCE_PAT`, a Personal Access Token for the Marketplace publisher account, used for manual publishing
  - `GITHUB_TOKEN`, provided automatically by GitHub Actions

## Local setup

```bash
git clone https://github.com/kanad13/markdown-presentation-tool.git
cd markdown-presentation-tool
npm ci
```

## Daily development

### Run the extension locally

1. Open the repository in VS Code and press `F5` to start the Extension Development Host.
2. In the host window, open `examples/02-slide-mode-basics.md`.
3. Run `Markdown: Show Markdown Presentation` from the Command Palette.
4. Check slide rendering and navigation.

### Test with a local package

When `F5` does not work (a Codespace or a remote container), build and install a package:

```bash
npm run package
code --install-extension markdown-presentation-tool-*.vsix
```

Reload the window and open a Markdown file. To uninstall:

```bash
code --uninstall-extension KunalPathak.markdown-presentation-tool
```

The `.vsix` file is git-ignored. Do not commit it.

### Check rendering in a browser

`node scripts/render-harness.js` serves the generated page on `localhost`. The procedure is in [testing.md](testing.md#browser-harness-procedure).

### Checks before every commit

```bash
npm test                              # unit tests, Prettier check, ESLint
npm run package                       # builds the .vsix and verifies packaging
```

`npm run format` rewrites JavaScript and JSON with the repository's Prettier configuration. Prettier and ESLint share one style, so a format run never conflicts with the lint run. `src/webview.html` and Markdown files are outside Prettier's scope.

### Commits and branches

- Work on a feature branch. Do not commit to `main`.
- Group changes logically: dependencies, code, tests, documentation, version.
- Write messages that state the problem, the solution, and the reasoning behind non-obvious decisions.
- Stage files explicitly. Build artifacts can sit in the working directory.
- Add no attribution trailers to commits, pull requests, or release notes.

## Automation

Two GitHub Actions workflows run independently. CI never triggers a release, and a release never starts on its own.

| Workflow        | File                            | Trigger                           | Steps                                                                              |
| :-------------- | :------------------------------ | :-------------------------------- | :--------------------------------------------------------------------------------- |
| CI              | `.github/workflows/ci.yml`      | Push to `main`, every pull request | `npm ci`, `npm test`, production audit, package, verify the `.vsix`                |
| Release Publish | `.github/workflows/release.yml` | Manual `workflow_dispatch`        | Validate version and changelog, test, audit, package, tag, create the GitHub Release |

Both workflows run Node at the exact `engines.node` floor, so a regression on the lowest supported Node shows up in CI.

## Periodic maintenance

Follow the review procedure in [dependencies.md](dependencies.md#review-procedure) every quarter and whenever an advisory lands. Then confirm that `readme.md` and the guides match the code.

## Release process

Releases are deliberate. Prepare the code, merge, then trigger the workflow.

### Step 1: Decide the version

Use semantic versioning: `MAJOR.MINOR.PATCH`.

- `patch`: bug fixes only
- `minor`: backward-compatible features or visible behavior changes
- `major`: breaking changes

### Step 2: Bump the manifest

```bash
npm version <patch|minor|major> --no-git-tag-version
```

The command updates `package.json` and `package-lock.json`. The flag prevents a local tag, because the release workflow creates tags.

### Step 3: Update `CHANGELOG.md`

Add a section at the top with this exact header format. The release workflow validates it against `package.json`.

```
## [X.Y.Z] - YYYY-MM-DD
```

List user-facing changes only.

### Step 4: Validate store constraints

- The icon is a 256x256 PNG. The manifest reference documents a 128x128 minimum and recommends 256x256.
- The manifest declares `capabilities.untrustedWorkspaces.supported`. `test/package.test.js` checks it.
- `npx vsce ls` lists no development files. `test/package.test.js` checks this on every run.
- `engines.vscode` and the `@types/vscode` pin agree. `test/package.test.js` checks this too.

### Step 5: Build and smoke-test the package

Build the package from the final commit with `npm run package`. Run the installed-extension smoke check in [testing.md](testing.md#installed-extension-smoke-check). Publish only after that check passes.

### Step 6: Merge, then trigger the workflow

Merge the branch to `main` with a merge commit, run `npm test` on the merged result, and wait for CI to pass. Then run:

```bash
gh workflow run release.yml --ref main -f version=X.Y.Z
```

Pass the version without a `v` prefix. The workflow validates the branch, the version format, the manifest version, and the changelog entry. It verifies that the tag `mpt-vX.Y.Z` does not exist, runs the tests and the production audit, packages the extension, creates and pushes the tag, and creates a GitHub Release with the `.vsix` attached. The workflow stops there. Marketplace publishing is manual.

### Step 7: Publish to the Marketplace

After verifying the GitHub Release artifact, publish from the repository root:

```bash
npm ci
npm run publish -- --pat <VSCE_PAT>
```

Then confirm that the Marketplace listing shows the new version (allow for propagation delay), that the release exists with its asset, and that CI is green.

## Troubleshooting

| Symptom                                | Cause and fix                                                                                       |
| :------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| CI fails at the format step            | Run `npm run format` and commit the result                                                          |
| CI fails at lint or test               | Run `npm test` locally on the `engines.node` floor to reproduce                                     |
| Package step fails                     | Run `npm run package`. Check `package.json` for syntax errors or missing fields                     |
| Release fails: wrong branch            | Run the workflow with `--ref main`                                                                  |
| Release fails: invalid version         | Use exactly `X.Y.Z`. `v1.2.1`, `1.2`, and `1.2.1-beta` are rejected                                  |
| Release fails: version mismatch        | Make the input match `package.json`, commit, wait for CI, run the workflow again                    |
| Release fails: missing changelog entry | Add the `## [X.Y.Z]` header, commit, wait for CI, run the workflow again                            |
| Release fails: tag exists              | That version is released. Use a new version. Delete the remote tag only when it was created in error |
| Marketplace publish fails              | The token is usually invalid or expired. Create a new `VSCE_PAT` and run the publish command again  |
| CI passed, nothing published           | Expected. CI never publishes                                                                        |
