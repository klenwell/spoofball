# Spoofball design

How Spoofball looks and why. The live [style guide](https://klenwell.com/spoofball/style/) shows the current tokens and components. This document records the decisions behind them.

- **Tokens:** `src/design/tokens.ts` is the single source of truth. CSS reads the tokens as custom properties (`--color-court`, `--team-blue`, `--space-4`, …), which `installDesignTokens()` generates. Canvas drawing code imports them directly.
- **Epic:** [#16 Design direction](https://github.com/klenwell/spoofball/issues/16).

## Decisions (2026-11-20)

These were chosen by the owner from a set of mockup comparisons.

1. **Feel: dark, minimal, built from circles.**
   - It refines the prototype's look: a near-black background (`--color-background`), calm surfaces, and geometric shapes.
   - **Why:** the dark page frames the white court like an arena under lights, so the eye goes to the play. It also suits round discs on a round court.
2. **Court: circular and white, with a center target, on the dark page.**
   - On a phone in portrait, the opponent's seat row sits above the court and yours below.
   - The surface is white (`--color-court`), inside a light gray ring (`--color-court-ring`), as in the prototype's arena. The owner chose white over a dark court on #17 (2026-11-20).
   - **Why:** scoring depends on where a spoof is on the court, so the court's shape is part of the game, not just decoration. It also follows the prototype's court (radius 150, with a center target).
3. **Spoof avatars: custom geometric marks.** There's one mark per type, drawn in code.
   - **First draft:**
     - king: a star;
     - queen: a ring;
     - rook: a square;
     - bishop: a diamond;
     - knight: a chevron;
     - pawns: a dot (basic), a dot with a bar (noble), a dot with a peak (angry).
   - **Why:**
     - they look the same on every device;
     - they stay readable on a 10 px disc;
     - the three pawn variants can be told apart.

     Chess glyphs fail the last two, and emoji fail the first two.

   - **Status:** the owner will refine them in #18.
4. **Team colors: 8 named colors, re-tuned for the white court, with home and away kits.**
   - The names come from the prototype: red, orange, gold, green, teal, blue, purple and pink.
   - Each color is just dark enough to stand out on white, so all 8 have similar weight, and pure red against pure green is avoided.
   - **Cost of the white court:** the light colors had to deepen. Gold is now an olive-leaning `#A98921`, because a bright gold is only about 2:1 on white. Refining colors is part of #19.
   - **Home kit:** a disc filled with the team color (`base`), trimmed in its `deep` shade, with a white mark.
   - **Away kit:** a white disc trimmed in the team color, with the mark in its `deep` shade. On the white court, the trim, plus a light drop shadow on every disc, is what separates it from the court.
   - **Clash rule:** when both teams in a scrum have the same color, the visitor wears away. Otherwise both teams wear home. See `scrumKits()` in `src/design/kits.ts`. The Scrum epic decides which team is home.
   - **Why kits:** there are only 8 colors, so two teams will sometimes share one. This was the owner's revision on #17, modeled on home and visitor uniforms.
   - **Checked by unit tests:**
     - every `base` color, and so every away trim, has at least 3:1 contrast against the white court;
     - every home mark (white) has at least 3:1 contrast on its disc;
     - every away mark (`deep`) has at least 4.5:1 contrast on white;
     - every `base` color has at least 3:1 contrast on the dark seat rows (`--color-surface`).

     3:1 is the WCAG minimum for meaningful graphics (WCAG 2.1, 1.4.11).
5. **Navigation: a bottom tab bar on phones, a top bar on desktop.**
   - The tabs are **Scrum · Pharm · Stats**.
   - **Why:** it's the standard phone pattern. It's always visible, reachable with a thumb, and one tap from any screen. The prototype's circular hub was the alternative, but it adds a tap to every move.
6. **Where the design lives:** the live style guide (`/spoofball/style/`) plus this document.
   - **Why:** the owner reviews the design on the real site, where it's rendered exactly as the game renders it.

## Tokens at a glance

| Group       | Tokens                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette     | `background`, `surface`, `court`, `court-ring`, `court-line`, `target`, `court-text`, `text`, `text-muted`, `line`, `accent`, `white`, as `--color-*` |
| Team colors | `red`, `orange`, `gold`, `green`, `teal`, `blue`, `purple`, `pink`, as `--team-*` (base) and `--team-*-deep`                                          |
| Type        | `--font-body` (system UI), `--font-numeric` (monospace, for scores). Sizes from `--text-xs` to `--text-display`, on a 1.25 scale                      |
| Spacing     | `--space-1` to `--space-12`, on a 4 px grid                                                                                                           |
| Radii       | `--radius-sm`, `-md`, `-lg`, `-pill`, `-circle`                                                                                                       |

## Glossary

| Term           | Meaning                                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spoof**      | A player: a 2D disc. A team has 6. (The prototype called them "rooks".)                                                                                                                                   |
| **Spoof type** | A spoof's archetype. It's fixed when the spoof is created, sets its avatar mark, and shapes its skill rolls. The types are king, queen, rook, bishop and knight, plus three pawns: basic, noble and angry |
| **Scrum**      | A match against one other team, played over 3 rounds                                                                                                                                                      |
| **Round**      | One period of a scrum. Spoofs are placed, then play on their own for a fixed time                                                                                                                         |
| **Court**      | The circular playing area. Where a spoof is on the court affects its score                                                                                                                                |
| **Target**     | The court's center zone, which scores the most. (The prototype called it the "mosh".)                                                                                                                     |
| **Seat**       | Where a spoof waits before it's placed on the court. Each team has a row of seats                                                                                                                         |
| **Kit**        | How a team's discs look in a scrum: **home** (filled with the team color) or **away** (white, trimmed in the team color)                                                                                  |
| **Expansion**  | Creating your team: name, color and emoji logo, then the draft. In sports, a league adds new teams through expansion                                                                                      |
| **Draft**      | Picking your 6 spoofs from a generated pool of 18–24                                                                                                                                                      |
| **Pharm**      | Managing your team: your roster, replacing a spoof, re-drafting. From "farm system"                                                                                                                       |
| **Stats**      | Your team's record and each spoof's numbers across scrums                                                                                                                                                 |
