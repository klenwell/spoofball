import type { Random } from './random';

/**
 * Spoof names (#28): a playful word and a first name, such as "Dizzy Gus".
 * Every spoof gets one when it's made, from the same seeded random source as
 * its skills, so a team or a pool is the same every time from its seed.
 *
 * The lists are plain data, reviewed with the owner. They keep to the game's
 * light, slightly silly tone, and leave out anything that could hurt: no
 * words about bodies, looks or real people. They also leave out the game's
 * own words (king, rook, pawn, kit, mise and so on), so a name is never
 * mistaken for a type or a rule. Every pairing fits 16 characters.
 */

export const NAME_WORDS: readonly string[] = [
  'Big',
  'Bouncy',
  'Breezy',
  'Bubbly',
  'Cheeky',
  'Comfy',
  'Dapper',
  'Dizzy',
  'Fancy',
  'Fizzy',
  'Fuzzy',
  'Giddy',
  'Jazzy',
  'Jolly',
  'Lucky',
  'Merry',
  'Mighty',
  'Misty',
  'Nifty',
  'Peppy',
  'Plucky',
  'Quirky',
  'Rowdy',
  'Rusty',
  'Sleepy',
  'Snappy',
  'Sneaky',
  'Spiffy',
  'Spooky',
  'Sunny',
  'Wiggly',
  'Wobbly',
  'Zippy',
];

export const FIRST_NAMES: readonly string[] = [
  'Archie',
  'Bea',
  'Bean',
  'Biscuit',
  'Bo',
  'Boris',
  'Bruno',
  'Clem',
  'Cosmo',
  'Dot',
  'Fern',
  'Fig',
  'Fritz',
  'Gertie',
  'Gus',
  'Hank',
  'Hazel',
  'Ida',
  'Iggy',
  'Juno',
  'Lou',
  'Lulu',
  'Mabel',
  'Mavis',
  'Milo',
  'Mo',
  'Moxie',
  'Muffin',
  'Ned',
  'Nell',
  'Noodle',
  'Olive',
  'Otis',
  'Ozzy',
  'Percy',
  'Pickles',
  'Pip',
  'Pudding',
  'Rufus',
  'Sprout',
  'Tater',
  'Tilly',
  'Waffles',
  'Wanda',
  'Zeke',
  'Ziggy',
];

/**
 * A new name, unlike every name in `taken` (the team's or pool's others).
 * Neither of its words is used by a taken name, so two spoofs on one team are
 * never "Dizzy Gus" and "Lucky Gus". With up to 15 spoofs in a pool, there are
 * always words left; if a list ever ran out, its words are reused, and only
 * the whole name is kept unique.
 */
export function drawSpoofName(random: Random, taken: readonly string[] = []): string {
  const takenWords = new Set(taken.flatMap((name) => name.toLowerCase().trim().split(/\s+/)));
  const unused = (words: readonly string[]) => {
    const left = words.filter((word) => !takenWords.has(word.toLowerCase()));
    return left.length > 0 ? left : words;
  };
  const takenNames = new Set(taken.map((name) => name.toLowerCase().trim()));
  const firsts = unused(FIRST_NAMES);
  const names = unused(NAME_WORDS)
    .flatMap((word) => firsts.map((first) => `${word} ${first}`))
    .filter((name) => !takenNames.has(name.toLowerCase()));
  if (names.length === 0) throw new RangeError('No spoof name left to draw');
  return random.pick(names);
}
