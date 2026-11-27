import { computerMise } from '../game/computer-play';
import { leagueOpponent } from '../game/league';
import { matchRecord, playScrum, startMatch, type Outcome } from '../game/match';
import { createRandom } from '../game/random';
import {
  STORAGE_KEY,
  browserStorage,
  loadRoster,
  loadTeam,
  recordMatch,
  saveMatchInProgress,
  saveTeam,
  type KeyValueStore,
} from '../storage/saved-team';
import { newSeed, timeOfDay, today } from '../ui/dom';
import { START_HASH } from '../ui/routes';
import { hashFor } from '../ui/tabs';
import type { Team } from '../game/teams';
import {
  findOpponent,
  matchLine,
  prospectLine,
  prospectRows,
  quickDraft,
  simUntil,
  teamLine,
  teamRows,
} from './qa-core';

/**
 * The QA console (#117): `QA` in the browser's Console, on the dev server
 * only. `main.ts` loads this behind `import.meta.env.DEV`, so it never
 * reaches the production build, and `scripts/check-dev-free.js` fails the
 * build if it does.
 *
 * Commands that change the save reload the page on the screen to check, so
 * every screen reads the new state. A reload clears the Console, so what was
 * done is noted in `sessionStorage` and shown again once the page is back.
 */

const NOTE_KEY = 'spoofball-qa-note';

/** What a command says in the Console: one line. */
function say(message: string): string {
  console.info(`QA: ${message}`);
  return message;
}

function storage(): KeyValueStore | null {
  const store = browserStorage();
  if (!store) say("This browser isn't saving data, so there's nothing to change.");
  return store;
}

/** The saved team, or a line saying there's none. */
function savedTeam(store: KeyValueStore): Team | null {
  const loaded = loadTeam(store);
  if (loaded.ok) return loaded.team;
  say('No saved team. Create one, or run QA.newTeam().');
  return null;
}

/** Notes what was done, then reloads on a screen: the note shows once the page is back. */
function reloadOn(hash: string, note: string): string {
  sessionStorage.setItem(NOTE_KEY, note);
  window.history.replaceState(null, '', hash);
  window.location.reload();
  return note;
}

/** Plays and records `n` matches ending in `result`, then shows the Stats tab. */
function sim(result: Outcome | undefined, n: number, opponent?: string): string {
  const store = storage();
  if (!store) return 'No storage.';
  const team = savedTeam(store);
  if (!team) return 'No saved team.';
  const lines: string[] = [];
  // A run that stops partway still reloads, saying what it recorded first,
  // so the open screens aren't left out of date (#118 review).
  const stop = (message: string): string =>
    lines.length === 0
      ? say(message)
      : reloadOn(hashFor('stats'), `Recorded ${lines.join('; ')}; then: ${message}`);
  let seed = newSeed();
  for (let i = 0; i < n; i += 1) {
    const found = findOpponent(opponent, createRandom(seed));
    if (!found.ok) return say(found.message);
    const played = simUntil(team, found.value, result, seed);
    if (!played.ok) return stop(played.message);
    const now = new Date();
    const saved = recordMatch(store, played.value.record, today(now), { time: timeOfDay(now) });
    if (!saved.ok) return stop(`The match couldn't be recorded: ${saved.problem}.`);
    lines.push(matchLine(played.value.record));
    // The next search starts after every seed this one tried.
    seed += played.value.tries;
  }
  return reloadOn(hashFor('stats'), `Recorded ${lines.join('; ')}.`);
}

const QA = {
  help(): string {
    const lines = [
      'QA.simLoss(n = 1)    play and record n losses, then show Stats',
      'QA.simWin(n = 1)     play and record n wins',
      'QA.simTie(n = 1)     play and record n ties (about 1 match in 100 ties: a few seconds each)',
      "QA.simMatch({ result, opponent })   result 'won' | 'lost' | 'tied' (any if left out); opponent a league team's name (random if left out)",
      'QA.simForfeit()      leave a match after scrum 1; the reload records the forfeit',
      'QA.newTeam()         save a team drafted from a combine pool, skipping the combine',
      'QA.team()            the team: hidden types and skill totals (dev only)',
      'QA.prospects()       the prospects (draft picks), oldest first, against their range',
      'QA.reset()           clear the saved game, after a confirm',
    ];
    console.info(['QA console (dev only):', ...lines].join('\n'));
    return 'See the list above.';
  },

  simMatch({ result, opponent }: { result?: Outcome; opponent?: string } = {}): string {
    return sim(result, 1, opponent);
  },
  simLoss(n = 1): string {
    return sim('lost', n);
  },
  simWin(n = 1): string {
    return sim('won', n);
  },
  simTie(n = 1): string {
    return sim('tied', n);
  },

  simForfeit(): string {
    const store = storage();
    if (!store) return 'No storage.';
    const team = savedTeam(store);
    if (!team) return 'No saved team.';
    const seed = newSeed();
    const opponent = leagueOpponent(seed);
    let match = startMatch(team, opponent, seed);
    match = playScrum(match, computerMise(match));
    const now = new Date();
    const saved = saveMatchInProgress(store, matchRecord(match, { soFar: true }), today(now), {
      time: timeOfDay(now),
    });
    if (!saved.ok) return say(`The match in progress couldn't be saved: ${saved.problem}.`);
    return reloadOn(
      hashFor('stats'),
      `Left a match against ${opponent.name} after scrum 1: recorded as a forfeit.`,
    );
  },

  newTeam(): string {
    const store = storage();
    if (!store) return 'No storage.';
    if (
      loadTeam(store).ok &&
      !window.confirm('Replace your saved team, its record and its prospects?')
    ) {
      return say('Kept your team.');
    }
    const team = quickDraft(newSeed());
    const saved = saveTeam(store, team, { endDraft: true, joined: today() });
    if (!saved.ok) return say(`The team couldn't be saved: ${saved.problem}.`);
    return reloadOn(
      hashFor('match'),
      `Saved ${team.logo} ${team.name}, drafted from a combine pool.`,
    );
  },

  team(): string {
    const store = storage();
    const team = store && savedTeam(store);
    if (!team) return 'No saved team.';
    console.table(teamRows(team));
    return say(teamLine(team));
  },

  prospects(): string {
    const store = storage();
    const team = store && savedTeam(store);
    if (!store || !team) return 'No saved team.';
    const roster = loadRoster(store);
    if (!roster.ok) return say(`The prospects couldn't be read: ${roster.problem}.`);
    if (roster.roster.prospects.length > 0) console.table(prospectRows(team, roster.roster));
    return say(prospectLine(team, roster.roster));
  },

  reset(): string {
    const store = storage();
    if (!store) return 'No storage.';
    if (
      !window.confirm('Clear the saved game: the team, its record, its prospects and any draft?')
    ) {
      return say('Nothing cleared.');
    }
    window.localStorage.removeItem(STORAGE_KEY);
    return reloadOn(START_HASH, 'Cleared the saved game.');
  },
};

declare global {
  interface Window {
    QA?: typeof QA;
  }
}

window.QA = QA;
const note = sessionStorage.getItem(NOTE_KEY);
if (note !== null) {
  sessionStorage.removeItem(NOTE_KEY);
  say(note);
}
console.info('QA console ready (dev only): QA.help()');
