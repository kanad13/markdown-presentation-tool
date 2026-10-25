# Task Workflows

This guide holds the procedure for each kind of request. [AGENTS.md](../AGENTS.md) holds the routing table that picks the procedure, and the rules that apply to every procedure. Run the matching workflow and stop at its stopping point. The workflows link to the canonical guides and never repeat their content.

`test/docs.test.js` fails when a workflow name in the routing table has no heading here, or the reverse.

## Evaluate a Change

The goal is a verdict with evidence, not code.

- **Ground:**
  - Read [decisions.md](decisions.md) for earlier decisions on the same idea.
  - Read [architecture.md](architecture.md) and the code the change would touch.
  - For a new dependency, apply the selection policy in [dependencies.md](dependencies.md).
- **Weigh:**
  - Value: Does it fix a real failure or add a capability presenters need?
  - Cost: What does it add in code, risk (especially the CSP and the settings pipeline), and upkeep?
  - Goals: Does it keep the extension free of runtime dependencies and configuration sprawl, with a strict CSP?
  - Modes: Does it work in slide mode, and does Mermaid-only mode keep working for files written for the original `mermaid-slideshow` extension?
- **Verify:**
  - Check each factual premise (a library's behavior, an editor API, a store rule) against primary sources.
- **Verdict:**
  - Choose one: pursue, scoped pursue, counter-proposal, defer, or reject.
  - Explain the verdict in plain terms: what the feature is, what it costs, and what would change the answer.
- **Stopping point:**
  - Report the verdict. Do not implement.
  - When the verdict is defer or reject, add an entry to [decisions.md](decisions.md) on a branch.

## Build an Approved Change

The goal is a tested, documented change on a branch, ready for the maintainer's review.

- **Plan:**
  - For a change that touches several files, follow the [multi-file change protocol](../AGENTS.md#multi-file-change-protocol).
- **Build:**
  - Write the test first when the change fixes behavior or adds a handler. See [testing.md](testing.md).
  - Keep logic in `src/extension.js` and the page in `src/webview.html`, within the [architecture rules](../AGENTS.md#architecture-rules).
- **Security:**
  - Review any change to the CSP, the template substitution, the settings allow-lists, or message passing. [architecture.md](architecture.md#content-security-policy) describes the policy.
- **Sync:**
  - Update [architecture.md](architecture.md), [readme.md](../readme.md), [testing.md](testing.md), and [CHANGELOG.md](../CHANGELOG.md) when the change affects them.
- **Verify:**
  - Run `npm test`.
  - Run the [browser harness procedure](testing.md#browser-harness-procedure) for changes to the renderer, the stylesheet, the CSP, or `MERMAID_VERSION`.
- **Stopping point:**
  - Commit on the branch and build a `.vsix` with `npm run package`.
  - Give the maintainer the file path and install command.

## Maintain and Upgrade

The goal is a repository whose dependencies, support floor, tests, and documents are current.

- **Dependencies:**
  - Follow the [review procedure](dependencies.md#review-procedure).
  - Apply the selection policy to every tool and to the CDN-loaded Mermaid in the same way.
- **Mermaid:**
  - `npm audit` cannot see Mermaid, because the webview loads it from the CDN at run time.
  - Check the version in `MERMAID_VERSION` against Mermaid's published advisories.
- **Editor floor:**
  - Apply the [editor and Node support policy](dependencies.md#editor-and-node-support-policy). Check forks before you raise the floor, and read [decisions.md](decisions.md) for any hold on the floor.
- **Registries and authentication:**
  - Confirm that the publishing steps in [development.md](development.md#release-process) still match the store's current rules.
- **Verify:**
  - Run `npm test` on the `engines.node` floor and on the current Node.
  - Run the browser harness in a light and a dark theme when `MERMAID_VERSION` changes.
- **Sync:**
  - Run [Sync and Audit](#sync-and-audit) for the files you changed.
- **Stopping point:**
  - Commit on a branch and report what changed, what was verified, and what the maintainer must decide.
  - Propose a release only when user-visible behavior changed or a security fix landed.

## Fix a Defect

The goal is a fix that a test proves.

- **Reproduce:**
  - Write a failing automated test first. When automation is not possible, record a repeatable manual reproduction in [testing.md](testing.md).
- **Fix:**
  - Change the implementation. Never weaken an assertion to get a green run.
- **Prove:**
  - Break the fix on purpose and confirm that the test fails. Restore the fix.
- **Sync:**
  - Update documents that described the wrong behavior, and add a [CHANGELOG.md](../CHANGELOG.md) entry for user-visible fixes.
- **Stopping point:**
  - Commit on a branch and report the cause, the fix, and the evidence.

## Release

The goal is a published version that matches a tagged commit.

- **Preconditions:**
  - The maintainer asked for a release, and the branch is merged to `main` by their instruction.
  - CI is green on `main`.
- **Store checks:**
  - Follow [Validate store constraints](development.md#step-4-validate-store-constraints). `test/package.test.js` enforces most of them.
- **Local proof:**
  - Build the `.vsix`, run the [installed-extension smoke check](testing.md#installed-extension-smoke-check), and wait for the maintainer's confirmation that it works.
- **Procedure:**
  - Follow the [release process](development.md#release-process). The maintainer pushes the `vX.Y.Z` tag; the release workflow creates the GitHub Release and publishes to Open VSX, and Marketplace publishing stays manual.
- **Tag:**
  - The workflow tags the exact commit it packages. If a fix lands afterward, report it and ask before you move the tag.
- **Verify:**
  - Check the Marketplace listing (allow for propagation delay), the GitHub Release asset, and CI.

## Sync and Audit

The goal is one truth across code, documents, and tests.

- **Compare:**
  - List every claim in [readme.md](../readme.md), [architecture.md](architecture.md), [development.md](development.md), [testing.md](testing.md), and [AGENTS.md](../AGENTS.md) that the code can confirm or contradict.
  - Check each claim against the code and fix the document or the code.
- **Contracts:**
  - Check that commands, settings, and manifest fields agree across `package.json`, the code, the documents, and the tests.
- **Links:**
  - `npm test` checks every relative link and heading anchor in the Markdown files.
  - Check cross-references between guides that a link cannot prove, such as a section described by name.
- **Formatting:**
  - `npm test` runs the Prettier check and ESLint. Run `npm run format` to fix a failure.
- **Stopping point:**
  - Commit on a branch and list the drift items that you found and fixed.

## Share With Sibling Extensions

The goal is that a shared improvement reaches every extension that benefits from it.

- **Trigger:**
  - Run this workflow after you change a shared file, or when the maintainer asks whether the other extensions need a change.
  - [sibling-extensions.md](sibling-extensions.md) lists the shared files and the sibling repositories.
- **Compare:**
  - Run the comparison command in [sibling-extensions.md](sibling-extensions.md#compare-a-shared-file-with-the-siblings) for each changed shared file.
  - For a shared practice, read the matching file in each sibling and decide whether it has the same gap.
- **Propose:**
  - List each sibling with one outcome: apply the change, or no change needed and why.
  - Wait for the maintainer to approve before you edit any sibling.
- **Apply:**
  - Follow [Carry a change to a sibling](sibling-extensions.md#carry-a-change-to-a-sibling) for each approved sibling.
  - Run the sibling's `npm test`.
- **Stopping point:**
  - Report each sibling's branch and test result.
  - Do not push, merge, tag, or release a sibling without the maintainer's instruction.

## Change Documentation

The goal is documents that describe the current state and read at a glance.

- **Content:**
  - Describe the current state in present tense. Put history in [CHANGELOG.md](../CHANGELOG.md) and Git.
  - State each fact in one place and link to it from elsewhere. Version numbers live only where [dependencies.md](dependencies.md#where-versions-live) names.
- **Structure:**
  - Put the overview first, then mechanisms, then detail.
  - Use a bold category anchor with single-assertion child bullets, and use tables for conditional rules. Keep ordered runbooks in step order.
- **Check:**
  - Run `npm test` for links and anchors, and confirm that [readme.md](../readme.md) still matches the features that exist.
- **Stopping point:**
  - Commit on a branch and report which documents changed.
