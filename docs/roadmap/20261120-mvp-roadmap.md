# Roadmap: Spoofball MVP

Written: 2026-11-20 · **Status: approved** (2026-11-20). Based on [pitch.md](../pitch.md). Epics are refined one at a time with `/epic` and tracked in a Spoofball GitHub Project.

## Why

Spoofball is a simple one-player 2D sports simulation for the browser. You draft a team of five discs ("spoofs"), place them on the court, and watch them play a match of 3 scrums on their own against a computer team. It rebuilds the backgammon-chrome / blowrook prototype as a static site on GitHub Pages.

The project has two goals: **ship the game**, and **document openly how it's built**.

## Starting point (findings, 2026-11-20)

The prototype is `~/projects/backgammon-chrome` (2014, Python 2.7 App Engine, Mercurial, KineticJS + jQuery). There, a spoof is a **rook**.

- **The match ran on the server.** The Python in `lib/minrook/` (`rook_ai`, `scorekeeper`, `mise`, `teams`) simulated each scrum (the prototype called it a round), and the browser replayed the frames. Pages has no server, so **the simulation moves to TypeScript and runs in the browser.**
- **Scrum:** 8 seconds. The prototype simulated 300 frames a scrum, but that isn't fixed: the Match epic picks a frame rate that serves gameplay and performance (the owner, on #27). Its score is a snapshot of where the spoofs are at the end: the court area each covers, weighted by zone (`scorekeeper.py`). A whole match usually totals 10–100 points.
- **Placement ("mise"):** teams take turns placing 3 rooks each per scrum, and the host places last (`mise.py`). You want to change these rules. That decision belongs to the Match epic.
- **Spoof model:** 11 skills (size, mass, growth, burst, stamina, iq, vision, charisma, cooperation, impact, constancy). They roll up into 5 comps (force, zip, smarts, mesh, will). The prototype's Pharm roster showed the comps without numbers, as "spangles": a circle per comp, sized and colored by its value. Spoofball hides them (see [design](../design.md), Decision 7). Each spoof also has an avatar, a base radius of 10–24 (it can blow from 8 to 40 in play), and fatigue.
- **Per-spoof stats** already exist: imps, pings, pongs, heeds, jecks, dings, dongs, doves, trees. These give the Stats epic a ready list.

We use the prototype as **a spec, not code to port**. We carry over the behavior and the tuning numbers, rewritten as tested TypeScript.

## Goals

1. **Playable from the first epic on.** The game deployed at `klenwell.github.io/spoofball` is playable after every merged step, even if it's thin.
2. **The four MVP parts:** Draft (New Team) (create and draft your team), Match, Pharm (manage your team), Stats. See the [glossary](../design.md#glossary).
3. **Works on phones** as well as desktop.
4. **Transparent process.** Epics, tickets, PRs and short epic READMEs tell the story of how it was built.
5. **Quality bar:** lint and tests run in CI on every PR, and the code is readable over clever.

## Scope

**In:** the four parts above, one-off matches against generated teams, one saved team per browser, and phone support.

**Out (post-MVP):** trades and free agents, spoof progression, leagues and seasons, multiple saved teams, accounts and servers, sound.

## Stack

| Concern            | Choice                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Language           | TypeScript (strict)                                                                             |
| Build / dev server | Vite                                                                                            |
| Rendering          | Canvas 2D for the court, plain DOM and CSS for screens. No game engine or UI framework at first |
| Tests              | Vitest, following `docs/testing.md` (Better Specs principles adapted to Vitest)                 |
| Lint / format      | ESLint + Prettier                                                                               |
| CI / deploy        | GitHub Actions: lint, test and build on PRs; deploy to Pages on merge to `main`                 |
| Saves              | `localStorage` behind a small versioned save module                                             |

The simulation is **deterministic given a seed**, so matches can be tested and replayed.

## Principles

- **Every ticket is releasable.** Merging to `main` deploys, and the game still works.
- **Approval first.** You approve each epic and ticket before coding, and review each PR before merge.
- **Static and thin.** A dependency is added only when it earns its place, and the reason is recorded.
- **Issues and PRs record what really happened,** including failures.

## Tracking

The same conventions as Dr. George and Sweepers:

- A user Project on `klenwell`, named **"Spoofball"**.
- Each milestone is a GitHub milestone on the repo, holding its epics and their steps.
- Each epic is a parent issue labeled `epic`. Each step is a sub-issue labeled `story`, `task` or `bug`.
- One PR per step. The PR description is the step's runbook, with `Closes #<step issue>` in the body.
- Project statuses are Todo → In Progress → QA → Done. Defects get a Severity field.
- GitHub is the record: there are no per-epic docs folders. Lasting docs (this roadmap, guides, the retrospective in `docs/retrospectives/`) live in `docs/`.

## Milestones and epics

Each **milestone** is a release, and it ships the next minor version. A milestone contains one or more **epics**, and each epic is a set of steps. The live site still updates on every merge, so the game stays playable after every step. A milestone is the point where we tag a version and publish release notes.

### Foundation (`v0.1.0`)

What a player gets: **a live "Spoofball" page.**

- **Epic 0, `foundation`:** repo `klenwell/spoofball`, the Project and labels, the Vite + TS skeleton, CI, the Pages deploy, `CLAUDE.md` and `docs/testing.md`.

### First Match (`v0.2.0`)

What a player gets: **a full, styled match between two preset teams.**

- **Epic 1, `design-direction`:**
  - a light style guide (palette, type, spacing);
  - a mobile-first layout and the disc look;
  - wireframes for the court and the four screens;
  - the app shell, navigation, and a static court with discs.

  Each later epic refines the design of its own screen.

- **Epic 2, `match`:**
  - the simulation in TS (physics, spoof AI, scoring, fatigue);
  - the new placement rules;
  - 3 scrums, a scoreboard and a result screen, using two preset teams.

  **Playable in `v0.2.0`:** a whole match of the Comets against the Embers, on a phone or desktop. You place your spoofs in each mise, by dragging or tapping. Then each scrum plays itself, with a live scoreboard and pause. Fatigue carries between scrums, a result shows after each one, and a scorecard ends the match. The rules are in [design](../design.md#match-1).

### Your Team (`v0.3.0`)

What a player gets: **create and draft your own team, play matches, and see stats that last.**

- **Epic 3, `draft`, Draft (New Team)** (named `expansion` until #69, 2026-11-23):
  - create a team (name, color, emoji logo);
  - draft 5 spoofs from a generated pool of 10 through **the combine**, within a budget: candidates show their hidden abilities by moving, in warm-ups and drills, and the only number is each one's price (#72; see [design](../design.md)). The combine reuses the Match epic's simulation;
  - save locally;
  - play your team against a generated opponent.

  **Playable in `v0.3.0-alpha.1`** (#69): create a team, then draft 5 spoofs in the combine, within a budget of 250 coins. You can watch candidates warm up and put them through 4 drills, rename your picks and give each one any of 16 marks. Your team is saved in your browser and plays a league of 7 computer teams, from easiest to hardest, one drawn for each match. The quick start's Spoofs still play the Embers. The rules are in [design](../design.md#draft-new-team-1).

- **Epic 4, `stats`:** record team and spoof stats for each match. A stats screen shows the team record and a line for each spoof. History survives a reload.

  **Playable in `v0.3.0`** (#88): your team's matches are recorded in your browser and survive a reload. The Stats tab shows your record, matches, points per match and best score, a line for each spoof, league standings with your team among the league's 7 by win percentage, and a log of your last 20 matches, colored by result, with when each was played. Leaving a match after its first scrum starts warns you, and counts it as a forfeit loss. The match scorecard says the match was recorded, with your record now. The quick start's Spoofs aren't recorded. The decisions are in [design](../design.md#stats-1).

### Pharm (`v0.4.0`)

What a player gets: **manage the roster.**

- **Epic 5, `pharm`:** a roster view and spoof cards showing outcomes, never skills. Scout a spoof with drills, replace one for a draft pick (from 3 prospects), or re-draft the whole team (Decision 2).

### MVP (`v1.0.0`)

What a player gets: **the finished MVP, polished and tested on phones.**

- **Epic 6, `mvp-release`:** a phone QA pass, accessibility basics, the README, the `v1.0.0` tag, and a retrospective.

Match comes before the Draft (New Team) epic because it's the core of the game and its biggest risk, and two preset teams are enough to make it playable.

## Decisions (2026-11-20)

1. **Matches are autonomous after placement.** You place spoofs, then each scrum plays itself. Who plays, and the placement rules, are decided at the match level. The new rules are settled when the Match epic is planned.
2. **The Pharm screen can replace a spoof or re-draft the team.** Trades, free agents and progression come after the MVP.
3. **A spoof's type is fixed when it's created, shapes its skill rolls, and sets its avatar.** This keeps the prototype's logic (`AVATAR_DIST` in `backgammon-chrome/.../models/rook.py`).
   - **Types:** king, queen, rook, bishop and knight (spelled "night" in the prototype's code), plus three pawn variants (basic, noble, angry).
   - **What each type sets:**
     - a per-skill weighting across the 11 skills;
     - a cap on total skill points (792 for king and queen, 748 for rook, bishop and knight, 704 for pawns);
     - draft odds. Pawns make up 65% of draws, and kings 2%.
   - **Visuals:** the Design Direction epic redesigns the avatars, which are chess glyphs today.
4. **Semver, one minor version per milestone.**
   - Each milestone ships the next minor version: Foundation is `v0.1.0`, First Match `v0.2.0`, Your Team `v0.3.0` and Pharm `v0.4.0`.
   - **Each epic ships a version too.** An epic that isn't the last in its milestone ships a pre-release of the milestone's version, published as a GitHub pre-release.
     - For example, Design Direction ships `v0.2.0-alpha.1`, then Match completes First Match as `v0.2.0`.
     - The last epic in a milestone ships the milestone's version itself, so a single-epic milestone has no alpha.
   - Fixes are patch releases (`v0.2.1`).
   - The MVP milestone is `v1.0.0`.
   - After 1.0, a change that breaks existing saves needs a major version or a save migration.
5. **Milestones group epics** (decided 2026-11-20, replacing "one minor version per epic").
   - They're GitHub milestones on the repo, with no due dates: all the work is as soon as possible.
   - Every epic and step issue is assigned to one.
   - A small task outside any epic goes in the current milestone.

6. **Screen names** (2026-11-20).
   - **Expansion** replaces "New Team". In sports, a league adds new teams through expansion.
     - **Renamed Draft (New Team)** on #69 (2026-11-23), which says more plainly what it is.
   - **Pharm** replaces "GM screen". It comes from "farm system", as in the prototype.
   - The pitch keeps its original wording.

7. **Match and scrum** (2026-11-20, on #20).
   - A **match** is the whole contest between two teams. A **scrum** is one of its 3 periods (the prototype's "round"). "Round" is no longer a game term.
   - The tab, the milestone (First Match) and epic 2 (`match`) are named to match.

## Open questions

None at the moment. Questions that come up during planning are recorded in each epic.

## Done when

- `klenwell.github.io/spoofball` lets you create a team, draft it, play matches, see stats, and manage the roster, on desktop and phone.
- Every milestone and epic is closed, with every step closed by a merged PR that passed CI.
- The retrospective is written.
