# Spoofball

A one-player 2D sports simulation for the browser, built in TypeScript and deployed to GitHub Pages. The plan is in [docs/roadmap/20261120-mvp-roadmap.md](docs/roadmap/20261120-mvp-roadmap.md). The original idea is in [docs/pitch.md](docs/pitch.md).

## Roles

- **The owner (klenwell) is the product manager.** They make all product and design decisions. Suggestions are welcome, but ask; don't decide.
- **Claude is the coder and QA.**

## How work happens

- **Approval first.** The owner approves each epic and its step issues before work starts, and reviews every PR before it merges. Don't start the next step until the owner says so.
- **Tracking:** issues in this repo, on the [Spoofball Project](https://github.com/users/klenwell/projects/3) (#3). The statuses are Todo → In Progress → QA → Done.
  - An epic is an issue labeled `epic`. Its steps are sub-issues labeled `story` (user-facing) or `task`.
  - Defects are labeled `bug`, with the Project's Severity field set.
- **One branch and one PR per step.**
  - Branches are named `<epic-slug>-<step-slug>`, for example `foundation-repo-groundwork`.
  - The PR description is the step's runbook. It contains `Closes #<step>`, and no other closing keyword next to an issue number.
  - Testing instructions go in the step issue as a checklist. Link the PR and any files or pages to check directly.
  - The last checklist item is always **"Approve by merging"**. The owner can't click Approve on a PR opened from their own account, so merging (with a merge commit) is the approval.
- **Every merge to `main` must leave the game working.** Each step is releasable.
- **Milestones:** a milestone is a release, made of one or more epics (see the roadmap).
  - Every new epic and step issue must be assigned to a milestone.
  - A small task outside any epic goes in the current milestone.
  - Milestones have no due dates.
- **Versions (semver):**
  - Each milestone ships the next minor version (`v0.1.0`, `v0.2.0`, …), and the MVP milestone is `v1.0.0`.
  - An epic that isn't the last in its milestone ships a pre-release, `v<milestone version>-alpha.N` (for example `v0.2.0-alpha.1`), as a GitHub pre-release.
  - Fixes are patch releases.

## Posting to GitHub

End every issue comment, PR comment and review reply with this footer, after a blank line. These go out under the owner's account:

```
---
🤖 *Written by Claude (Claude Code), posted from this account.*
```

PR descriptions use the "Generated with Claude Code" footer instead, and commits use the `Co-Authored-By` line.

## Safety

- **Outward-facing actions need the owner's go-ahead at the time:** repo settings (including Pages), releases and tags, and anything that publishes. A merged PR is not permission.
- **The repo is public.** Never put secrets, tokens, personal email addresses or private hostnames in code, commits, issues or PRs.
- **No license file.** The owner's decision (2026-11-20) is that all rights are reserved. Don't add one.

## Code

- **Favor readability, security and reliability over cleverness or brevity.**
- **Keep infrastructure minimal.** A dependency is added only when it earns its place, and the PR records why.
- **The prototype is a spec, not code to port.** It is `~/projects/backgammon-chrome`, where a spoof is a "rook". Rewrite its behavior as tested TypeScript.

## Environment

- **Node version:** `.nvmrc` pins Node 24. The system Node is older, so load nvm first: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use`.
- **npm cache inside the sandbox:** for `npm install` or `npm view` in Claude's sandbox, set `npm_config_cache=$TMPDIR/npm-cache`, because `~/.npm` is read-only there.

## Commands

| Command                | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| `npm install`          | Install dependencies (CI uses `npm ci`)                         |
| `npm run dev`          | Dev server at http://localhost:5173/spoofball/                  |
| `npm run build`        | Production build into `dist/`                                   |
| `npm run preview`      | Serve the built `dist/` locally                                 |
| `npm test`             | Run the unit tests once (`npm run test:watch` to rerun on save) |
| `npm run typecheck`    | Type-check with `tsc`                                           |
| `npm run lint`         | ESLint (typescript-eslint strict and stylistic, type-checked)   |
| `npm run format:check` | Check Prettier formatting (`npm run format` to fix)             |

Before opening a PR, run `npm run lint && npm run typecheck && npm test && npm run format:check && npm run build`.

**Testing conventions** are in [docs/testing.md](docs/testing.md).
