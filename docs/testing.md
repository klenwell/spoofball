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
