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
  - Testing instructions go in the step issue as a checklist.
- **Every merge to `main` must leave the game working.** Each step is releasable.
- **Versions:** semver. Each epic ships the next minor version (`v0.1.0`, `v0.2.0`, …). The MVP is `v1.0.0`.

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
- **Commands:** none yet. Added with the app skeleton (#3).
