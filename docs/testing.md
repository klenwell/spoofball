# Testing guide

How we write tests in Spoofball. It adapts the [Better Specs](https://www.betterspecs.org/) principles from RSpec to [Vitest](https://vitest.dev/). The goal is tests that read like a description of the game's behavior and fail for one clear reason.

## Running tests

```bash
npm test             # run once (what CI runs)
npm run test:watch   # rerun on save while developing
```

## Where tests live

- **Next to the code they test,** named `<module>.test.ts`. For example, `src/app-info.ts` is tested by `src/app-info.test.ts`.
- **Shared test helpers** (factories, seeded random sources) go in `src/test-support/`. Production code never imports from there.

## Describe the behavior

- **`describe` names the thing under test:** a function or class (`describe('formatVersion')`), or a method within it (`describe('#place')`).
- **Use a nested `describe` with "when …" for each situation:** `describe('when the court is full')`.
- **`it` states the expected behavior in the present tense, without "should":** `it('rejects a version that is not semver')`, not `it('should throw')`.
- **The names should read as a sentence:** "formatVersion rejects a version that is not semver".

```ts
describe('Match', () => {
  describe('when both teams have placed all their spoofs', () => {
    it('starts the first scrum', () => {
      /* … */
    });
  });
});
```

## One behavior per test

- **Each `it` checks one behavior.** Several `expect`s are fine when together they describe that one behavior, such as the fields of one result.
- **Arrange, act, assert,** in that order, separated by a blank line when the test is longer than a few lines.
- **Keep setup next to the test that needs it.** Use `beforeEach` only for setup shared by every test in the block. A reader should understand a test without scrolling.

## Test behavior, not internals

- **Test through the public API:** exported functions and public methods.
- **Don't test private helpers directly,** and don't assert on internal state that a player or caller couldn't observe.
- **Mock only at real boundaries:** `localStorage`, time, randomness, the canvas. Never mock the module under test or its plain-data collaborators.
- **When a bug is fixed, first add a test that reproduces it.**

## Factories over fixtures

- **Build test data with small factory functions** that return valid objects with sensible defaults, and let each test override only what it cares about:

  ```ts
  const spoof = buildSpoof({ type: 'rook', size: 20 });
  ```

- **Don't share large fixture files or mutable objects between tests.** Each test gets fresh data.

## Randomness and time

- **Anything random takes a seeded random source as an input,** never `Math.random()` directly. Tests pass a fixed seed and get the same result every run. This also lets a whole match be replayed from its seed.
- **Anything time-based takes the time or a clock as an input.** Use Vitest's fake timers (`vi.useFakeTimers()`) only at the edges, such as the animation loop.

## Keep tests fast and isolated

- **The unit suite runs in Node, with no browser.** Keep game logic (simulation, scoring, drafting, stats) free of the DOM so it can be tested there.
- **Tests must not depend on order** or leak state: restore mocks and timers, and clear storage.
- **A test that fails now and then is a bug.** Fix it or delete it; don't retry it.

## What to test

| Code                                          | Expectation                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Game rules, simulation, scoring, draft, stats | Thorough unit tests, including edge cases                                                         |
| Save and load (`localStorage`)                | Round-trip tests, plus handling of missing or corrupt saves                                       |
| Rendering and DOM wiring                      | Kept thin. Covered by the testing instructions on each step, until browser tests earn their place |

## The QA console (dev only)

For checking a step by hand, the dev server (`npm run dev`) has a `QA` object in the browser's Console (#117). It gets a saved team into a given state without playing match after match. It's **never in the production build**: `main.ts` loads it only behind `import.meta.env.DEV`, and the `postbuild` script (`scripts/check-dev-free.js`) fails the build, locally and in CI, if any of it reaches `dist/`.

| Command                             | What it does                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `QA.help()`                         | Lists the commands                                                                                                                  |
| `QA.simLoss(n = 1)`                 | Plays matches until one is lost, `n` times, records each, then reloads on the Stats tab                                             |
| `QA.simWin(n = 1)`, `QA.simTie(n)`  | The same, for wins or ties. About 1 match in 100 is a tie, so a tie takes a few seconds                                             |
| `QA.simMatch({ result, opponent })` | One match: `result` is `'won'`, `'lost'` or `'tied'` (any if left out), `opponent` a league team's name (random if left out)        |
| `QA.simForfeit()`                   | Saves a match in progress after scrum 1 and reloads, so the game records the forfeit as it loads                                    |
| `QA.newTeam()`                      | Saves a team drafted from a combine pool, as a finished draft would, skipping the combine. It asks first if a team is saved         |
| `QA.team()`                         | A table of the team's spoofs, with their **hidden** types and skill totals, and the team's total against the ceiling                |
| `QA.prospects()`                    | A table of the prospects (draft picks), oldest first, with their **hidden** totals, each marked in, above or below the team's range |
| `QA.reset()`                        | Clears the saved game, after a confirm                                                                                              |

- **Matches are real:** played by the match simulation, with the computer placing for both teams, and recorded as play records them. They count in the record and the standings.
- **Commands that change the save reload the page** on the screen to check. The reload clears the Console, so the command's line shows again once the page is back.
- **Hidden numbers show here only** (the owner, 2026-11-27): no player ever sees them.
- **Mistakes are explained in a line,** such as "No saved team. Create one, or run QA.newTeam().", rather than thrown.
- **The logic is in `src/dev/qa-core.ts`,** tested in Node. `src/dev/qa.ts` is the browser glue, checked by hand. Later steps add commands as they need them.
