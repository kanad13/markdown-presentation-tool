# Dependency Guide

This guide defines how the project chooses, pins, and reviews dependencies. It holds policies and procedures only. Version numbers live in the files named under [Where versions live](#where-versions-live), so this guide never goes stale.

Related guides: [development.md](development.md) for the daily workflow, [testing.md](testing.md) for the checks that gate a change, and [architecture.md](architecture.md) for how the webview loads Mermaid.

## Overview

The extension ships no runtime dependencies. Three groups of external code still affect it.

| Group                      | What it is                                                     | Where it is declared                          |
| :------------------------- | :------------------------------------------------------------- | :-------------------------------------------- |
| Bundled runtime            | Code inside the `.vsix`. Only the extension's own files.       | `package.json` (`dependencies` stays absent)  |
| Runtime-loaded library     | Mermaid, fetched from jsDelivr by the webview at presentation time | `MERMAID_VERSION` in `src/extension.js`       |
| Tooling                    | Linter, formatter, type packages, and the Marketplace packager | `devDependencies` in `package.json`           |

The editor itself is a fourth moving part. The `engines.vscode` field sets the oldest editor release the extension installs on.

## Where versions live

- **Allowed locations:**
  - `package.json` holds ranges, the engine floors, and the exact `@types/vscode` pin.
  - `package-lock.json` holds the resolved tree.
  - `MERMAID_VERSION` in `src/extension.js` holds the runtime-loaded Mermaid version.
- **Documentation rule:**
  - Documents name these files and never repeat the numbers.
  - This guide never records what a past review found or changed. Git history and the changelog hold that.

## Version selection policy

A version qualifies only when it satisfies every rule in this table.

| Rule                  | Requirement                                                                                                                              |
| :-------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| Channel               | Stable. No alpha, beta, rc, canary, next, or nightly.                                                                                    |
| Major line            | The newest major line that still receives fixes. A line with no release for 12 months is abandoned unless the project declares it complete. |
| Age                   | A new major version is at least 30 days old. A minor or patch version is at least 14 days old.                                           |
| Advisories            | The production dependency tree has no known advisories.                                                                                  |
| Compatibility         | It runs on the current stable editor, on the support floor, and on the minimum Node version.                                             |
| Browser baseline      | The Chromium inside the support-floor editor meets the library's documented browser baseline.                                            |

Two further rules bind how a version is written.

- **CDN libraries:**
  - Use an exact `x.y.z` version. Never use a floating tag or a major-only tag.
  - Keep one constant (`MERMAID_VERSION`). The CDN URL and the Content Security Policy both derive from it.
- **Registry packages:**
  - Use a caret range and the committed lockfile.
  - Keep build tools on their current major version unless an advisory or an engine requirement forces a change.

## Editor and Node support policy

- **Editor target:**
  - Test on the current stable release of the editor. Insiders builds are not a target.
  - The engine floor is the newest editor release that is at least 12 months old.
- **Floor changes:**
  - Move the engine floor and the exact `@types/vscode` pin together, at each quarterly review.
  - A maintainer decision can hold the floor above this value. [decisions.md](decisions.md) records any such hold.
  - `test/package.test.js` fails when the two disagree.
- **Forks:**
  - Before raising the floor, check the base editor version of every fork the README advertises. A floor above a fork's base blocks installation there.
  - When a raised floor would exclude a named fork, present that trade-off to the maintainer.
- **Node:**
  - The `engines.node` floor is the lowest Node release that every tool in `devDependencies` accepts, on a line that still receives security fixes.
  - `@types/node` follows the major line of the Node that the support-floor editor bundles, so typings never describe APIs the extension host lacks.
  - CI runs `npm test` on exactly the `engines.node` floor.

## Configuration policy

- **Defaults first:**
  - Configure a library with its defaults.
  - Override a setting only for security, for matching the editor theme, or for aligning syntax with the extraction code.
  - Never override a library's visual defaults.
- **Content Security Policy:**
  - Keep it strict. Do not loosen it to silence a console message.
  - `script-src` names the exact Mermaid directory on the CDN, not the whole CDN host.
- **Overrides:**
  - Add a package override only when no upgrade path clears an advisory.
  - Re-test each override at every review, and remove it when the audit is clean without it.

## Review procedure

Run this quarterly, and whenever an advisory lands. The steps run in order.

1. Install from the lockfile with `npm ci`.
2. Inventory every dependency in the three groups above.
3. Look up current versions and publication dates in the registry (`npm view <package> time --json`) and apply the selection policy to each item.
4. Move `engines.vscode` and `@types/vscode` together when the support-floor rule yields a newer release. Re-check advertised forks first.
5. Apply in-range updates with `npm update --ignore-scripts`, then audit fixes with `npm audit fix --ignore-scripts`.
6. Run `npm audit --omit=dev` (production only) and `npm audit` (full). Production findings block a release. Dev-tree findings follow the rules below.
7. Hold any direct dependency whose newest release is under the age limit at the newest qualifying version. Install it by exact version, then confirm the lockfile.
8. Run `npm test` on the `engines.node` floor and on the current Node.
9. When `MERMAID_VERSION` changes, start the render harness and step through every example deck in a light and a dark theme (see [testing.md](testing.md)). Confirm that diagrams render and the console is clean.
10. Update `CHANGELOG.md` with user-visible effects only.

## Security limits that follow from the policy

- **Runtime CDN trust:**
  - The webview executes Mermaid from jsDelivr. The exact version pin and the directory-scoped `script-src` limit that trust to one published package version.
  - A network failure disables diagrams only. Text slides, navigation, and live update keep working.
- **Remote images:**
  - The CSP allows `https:` and `data:` images so `![alt](https://...)` renders. A presented document can therefore cause requests to the image hosts it names.
- **Settings as input:**
  - Workspace settings come from the opened folder. Every value passes an allow-list before it reaches CSS or script.
- **Dev-tree advisories:**
  - Tooling that never ships in the package (for example the Marketplace publishing chain) can carry advisories that the production audit does not report.
  - Fix them through the upgrade path when one clears the advisory without introducing a worse one. Otherwise report the residual finding to the maintainer and re-check at the next review.
  - Do not add an override while an upgrade path exists.
