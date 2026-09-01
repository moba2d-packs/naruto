/**
 * Every spell this pack ships, by id.
 *
 * Read by two things and written by hand: `catalog.config.mjs` points the
 * catalogue generator at this file, and the generator uses it twice — once to
 * construct each spell and read its display fields into
 * `generated/spellCatalog.ts`, and once to emit `generated/spellModules.ts`,
 * the `id -> () => import('...')` map a match loads kits through.
 *
 * The export *name* is the spell id. `pack.ts`'s roster names the same string
 * in a champion's `spells: [...]`, and a mismatch is a champion with an empty
 * slot rather than an error, so keep them in step.
 *
 * `moba2d-pack-add spell` appends here.
 */
export { default as Naruto_Q } from './Naruto_Q';
export { default as Naruto_W } from './Naruto_W';
export { default as Naruto_E } from './Naruto_E';
export { default as Naruto_R } from './Naruto_R';
export { default as Naruto_Q2 } from './Naruto_Q2';
export { default as Naruto_W2 } from './Naruto_W2';
export { default as Naruto_E2 } from './Naruto_E2';
export { default as Sasuke_Q } from './Sasuke_Q';
export { default as Sasuke_W } from './Sasuke_W';
export { default as Sasuke_E } from './Sasuke_E';
export { default as Sasuke_R } from './Sasuke_R';
export { default as Sasuke_Q2 } from './Sasuke_Q2';
export { default as Sasuke_W2 } from './Sasuke_W2';
export { default as Sasuke_E2 } from './Sasuke_E2';
// moba2d-pack-add spell: new barrel entries go above this line
