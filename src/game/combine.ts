import { createRandom, type Random } from './random';
import { minimumTotal, typeProfiles } from './skills';
import { spoofTypes, type SpoofType } from './spoof-types';
import { NEW_SPOOF_SKILL_TOTAL, generateSpoof, type Spoof } from './teams';

/**
 * The combine's pool (#72): about 10 candidates for your 5 picks, each with a
 * price. The owner's rules (2026-11-23, on #69 and #72):
 *
 * - Types are drawn with the combine's own odds: the prototype's, with fewer
 *   pawns and more royals. Each pool has at most 6 pawns and at least 1
 *   royal. There are no roster limits on your picks: the budget is the only
 *   limit.
 * - Strength is spread widely around a new team's level, 528 skill points a
 *   spoof, so candidates really differ in points.
 * - A price follows a candidate's raw skill total, never which skills it has,
 *   with a jitter, so it's only a rough hint and you still have to scout.
 * - Every pool is worth the same: its prices add up to twice the budget, so
 *   the 5 cheapest always fit within it.
 *
 * Everything comes from the pool's seed, so a reload brings back the same pool.
 */

/** Candidates in a pool. */
export const POOL_SIZE = 10;

/** What you can spend on your 5 picks. */
export const DRAFT_BUDGET = 250;

/** What a pool's prices add up to: twice the budget. */
export const POOL_VALUE = 2 * DRAFT_BUDGET;

export const MIN_PRICE = 1;
export const MAX_PRICE = 100;

/** How a pool is drawn: tuned in the owner's review round. */
export interface PoolTuning {
  /** Skill totals are drawn evenly within this many points of 528, either way. */
  readonly spread: number;
  /** The typical size of a price's jitter, in coins, before the pool is scaled. */
  readonly jitter: number;
  /**
   * How far a price moves from 50 for a total at either end of the spread,
   * before jitter: the stretch from skill points to coins.
   */
  readonly priceSwing: number;
}

/**
 * The owner's picks on #72 (2026-11-23): totals from 453 to 603 (within each
 * type's limits), prices swinging ±20 from 50 across that spread, and a
 * jitter of about 12 coins. Over 400 seeded pools, most prices fall between
 * 23 and 77, about 1 in 4,000 is 1, and the cheaper of two candidates has
 * more skill points about a quarter of the time (measured in the PR). A first try
 * swung ±45, which left the weakest candidates at a coin or two.
 */
export const DEFAULT_POOL_TUNING: PoolTuning = { spread: 75, jitter: 12, priceSwing: 20 };

/**
 * The combine's type odds, out of 100 (the owner, #72 QA, 2026-11-23): the
 * prototype's (`draftOdds` in skills.ts) with pawns cut from 65 to 50 and
 * royals raised from 5 to 10, keeping the shares within each group. With the
 * prototype's, about 60% of 10-candidate pools had no king or queen.
 */
export const COMBINE_TYPE_ODDS: Readonly<Record<SpoofType, number>> = {
  king: 5,
  queen: 5,
  rook: 13,
  bishop: 13,
  knight: 14,
  'pawn-basic': 23,
  'pawn-noble': 15,
  'pawn-angry': 12,
};

/** The most pawns in a pool. */
export const MAX_POOL_PAWNS = 6;
/** The fewest royals (kings and queens) in a pool. */
export const MIN_POOL_ROYALS = 1;

const isPawn = (type: SpoofType) => type.startsWith('pawn');
const isRoyal = (type: SpoofType) => type === 'king' || type === 'queen';

/**
 * The next candidate's type, given the types drawn so far and how many are
 * still to come. Once the pool has its most pawns, the rest are other types;
 * if the last places must hold the pool's royals, they're drawn from royals.
 */
function drawPoolType(random: Random, drawn: readonly SpoofType[], left: number): SpoofType {
  const pawns = drawn.filter(isPawn).length;
  const royalsNeeded = MIN_POOL_ROYALS - drawn.filter(isRoyal).length;
  const options = spoofTypes.filter((type) => {
    if (royalsNeeded > 0 && left <= royalsNeeded) return isRoyal(type);
    return !(isPawn(type) && pawns >= MAX_POOL_PAWNS);
  });
  return random.weighted(options.map((type) => [type, COMBINE_TYPE_ODDS[type]] as const));
}

export interface Candidate {
  readonly spoof: Spoof;
  readonly price: number;
}

/**
 * A raw price: about 50 for a spoof at a new team's level, rising with its
 * skill total by `priceSwing` coins across the spread, plus the jitter. The
 * pool's raw prices are then scaled to add up to `POOL_VALUE`.
 */
function rawPrice(total: number, jitter: number, tuning: PoolTuning): number {
  const slope = tuning.priceSwing / tuning.spread;
  return 50 + (total - NEW_SPOOF_SKILL_TOTAL) * slope + jitter;
}

/** A jitter with a typical size of `size`: the sum of 3 even draws, so small ones are likeliest. */
function drawJitter(random: Random, size: number): number {
  // Three draws in [-1, 1) have a spread (standard deviation) of 1.
  return (random.uniform(-1, 1) + random.uniform(-1, 1) + random.uniform(-1, 1)) * size;
}

/**
 * Whole prices within 1–100 that add up to `total`, in proportion to the raw
 * prices. Raw prices are scaled by one factor, found by bisection, so that,
 * once clamped to 1–100, they add up to `total`. Then they're rounded by
 * largest remainder, so the sum comes out exact.
 */
export function scalePrices(raw: readonly number[], total: number): number[] {
  const n = raw.length;
  if (n === 0 || total < n * MIN_PRICE || total > n * MAX_PRICE) {
    throw new RangeError(`Can't share ${String(total)} among ${String(n)} prices`);
  }
  const weights = raw.map((r) => Math.max(r, 0.01));
  const clamped = (factor: number) =>
    weights.map((w) => Math.min(MAX_PRICE, Math.max(MIN_PRICE, w * factor)));
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  let low = 0;
  let high = (MAX_PRICE / Math.min(...weights)) * 2;
  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    if (sum(clamped(mid)) < total) low = mid;
    else high = mid;
  }
  const exact = clamped(high);
  const prices = exact.map((p) => Math.floor(p));
  let short = total - sum(prices);
  // Largest remainder first; ties go to the earlier candidate, so it's deterministic.
  const order = exact
    .map((p, i) => ({ i, remainder: p - Math.floor(p) }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (const { i } of order) {
    if (short <= 0) break;
    if ((prices[i] ?? MAX_PRICE) < MAX_PRICE) {
      prices[i] = (prices[i] ?? 0) + 1;
      short -= 1;
    }
  }
  return prices;
}

/**
 * The pool for a seed: 10 named candidates, ids `p1` to `p10`, with prices
 * adding up to `POOL_VALUE`. The same seed always gives the same pool.
 */
export function createPool(seed: number, tuning: PoolTuning = DEFAULT_POOL_TUNING): Candidate[] {
  const random = createRandom(seed);
  const spoofs: Spoof[] = [];
  const raw: number[] = [];
  for (let i = 0; i < POOL_SIZE; i += 1) {
    const type = drawPoolType(
      random,
      spoofs.map((s) => s.type),
      POOL_SIZE - i,
    );
    const drawn = random.int(
      NEW_SPOOF_SKILL_TOTAL - tuning.spread,
      NEW_SPOOF_SKILL_TOTAL + tuning.spread,
    );
    // A total stays within what the type allows (a rook needs at least 482,
    // for example); the price follows what the spoof has.
    const total = Math.min(Math.max(drawn, minimumTotal(type)), typeProfiles[type].maxTotal);
    const jitter = drawJitter(random, tuning.jitter);
    const names = spoofs.map((s) => s.name);
    spoofs.push(generateSpoof(`p${String(i + 1)}`, type, total, random, names));
    raw.push(rawPrice(total, jitter, tuning));
  }
  const prices = scalePrices(raw, POOL_VALUE);
  return spoofs.map((spoof, i) => ({ spoof, price: prices[i] ?? MIN_PRICE }));
}
