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

Two GitHub Actions workflows run independently. CI never triggers a release, and a release starts only from a pushed `vX.Y.Z` tag or a manual run with an existing tag.

| Workflow        | File                            | Trigger                           | Steps                                                                              |
| :-------------- | :------------------------------ | :-------------------------------- | :--------------------------------------------------------------------------------- |
| CI              | `.github/workflows/ci.yml`      | Push to `main`, every pull request | `npm ci`, `npm test`, production audit, package, verify the `.vsix`                |
| Release         | `.github/workflows/release.yml` | Push of a `vX.Y.Z` tag, or manual `workflow_dispatch` with a tag | Validate tag, version and changelog, test, package, create the GitHub Release, publish to Open VSX |

Both workflows run Node at the exact `engines.node` floor, read from `.nvmrc`, so a regression on the lowest supported Node shows up in CI.

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

The command updates `package.json` and `package-lock.json`. The flag prevents a tag at this point, because the tag must point at the merged commit on `main` (step 6).

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

### Step 6: Merge, then tag

Merge the branch to `main` with a merge commit, run `npm test` on the merged result, and wait for CI to pass. Then tag the merged commit and push the tag:

```bash
git checkout main && git pull
git tag -a vX.Y.Z -m "Release version X.Y.Z"
git push origin vX.Y.Z
```

The tag push starts the release workflow. It checks that the tag is on `main` and matches `package.json` and the changelog entry, runs the tests, packages the extension, creates a GitHub Release with the `.vsix` attached, and publishes to Open VSX. The release workflow publishes to Open VSX. It signs in with a short-lived OIDC token that Open VSX issues to the registered trusted publisher (repository `kanad13/markdown-presentation-tool`, workflow `release.yml`), so no stored token is needed. The repository secret `OVSX_PAT` is a fallback: when it is set, the workflow uses it instead of OIDC. Delete it after a release has published through OIDC.

If the run fails after the tag exists, fix the cause and start the workflow again from the Actions tab (**Release > Run workflow**, from `main`, with the tag). Open VSX ignores a version it already has, so repeating a run is safe. Tags created before this scheme use the `mpt-v` prefix. They stay as history and are not published again.

### Step 7: Publish to the Marketplace

Open VSX is already published by the workflow. After verifying the GitHub Release artifact, publish to the Marketplace from the repository root:

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
| Release fails: wrong branch            | A manual run must start from `main`. A tag must point at a commit on `main`                          |
| Release fails: invalid tag             | Use exactly `vX.Y.Z`. `1.2.1`, `v1.2`, and `v1.2.1-beta` are rejected                                |
| Release fails: version mismatch        | The tag must equal `v` plus the `package.json` version. Fix, merge, and tag the new commit           |
| Release fails: missing changelog entry | Add the `## [X.Y.Z]` header, merge, and tag the new commit. Ask before moving a pushed tag           |
| Open VSX publish fails                 | Run the workflow again with the tag. A version Open VSX already has is skipped                       |
| Marketplace publish fails              | The token is usually invalid or expired. Create a new `VSCE_PAT` and run the publish command again  |
| CI passed, nothing published           | Expected. CI never publishes                                                                        |
