import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The VFX rules a machine can actually hold, and why only these three.
 *
 * ## Why this file exists
 *
 * Every visual failure this pack has shipped was already written down.
 * `docs/VFX_STANDARD.md` says an effect must not vanish on the frame it
 * lands, that an impact belongs on the victim, and that a champion may not
 * wear another champion's shape. All three were read, and all three were
 * broken anyway — the sand ultimate arrived instantly, disappeared on
 * contact, and its wall was somebody else's wall.
 *
 * So reading the standard harder is not the fix. `CLAUDE.md` in core states
 * the actual one: *every rule enforced by a test has never been broken; every
 * rule that was only prose has been broken at least once.* This file moves
 * the ones that **can** move.
 *
 * ## What deliberately is not here
 *
 * Two of the rules are not mechanizable and pretending otherwise would be
 * worse than leaving them out:
 *
 * - **"Does this hand off to an aftermath?"** — the hand-off is often one
 *   method away (`onHit` calls `this.burst()`, which spawns the vortex), and
 *   a scan that looks inside `onHit` flags three of five *correct* files. A
 *   check with a 60% false-positive rate is not a check; it is a debt list
 *   people learn to ignore. The rule below is the weaker, honest version.
 * - **"Is this shape this champion's own?"** and **"does it read as a wave
 *   rather than a mace?"** — eyes only. `tools/preview-shape.mjs` is the
 *   answer to those, and `AGENTS.md` says when to reach for it.
 *
 * Each rule below was measured against the whole pack before being written,
 * and each has been shown to fail by reintroducing the bug it describes.
 */
const SPELLS = join(__dirname, '../spells');

/** Comments discuss these rules by name; the scan must not flag its own docs. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const spellFiles = readdirSync(SPELLS).filter(name => name.endsWith('.ts') && name !== 'index.ts');

const sources = new Map(
  spellFiles.map(name => [name, stripComments(readFileSync(join(SPELLS, name), 'utf8'))])
);

const isMissile = (source: string): boolean =>
  /extends api\.(Missile|HomingMissile)SpellObject/.test(source);

describe('VFX rules a scan can hold', () => {
  it('has spell files to scan', () => {
    expect(spellFiles.length).toBeGreaterThan(30);
  });

  it('never reads `this.direction` off a missile — there is no such field', () => {
    // `MissileSpellObject` carries `position` and `destination`, and derives
    // its angle from the two. Reaching for `this.direction` yields
    // `undefined`, falls through whatever `??` fallback is beside it, and
    // draws every projectile at a fixed angle however it was aimed.
    //
    // This is the worst shape of bug the pack has had: it typechecks (the
    // property is `any` all the way down), it never throws, and the fallback
    // makes the result look deliberate. Gaara's ultimate shipped drawing
    // every wave pointing due east and nobody could tell from the file.
    const offenders = [...sources]
      .filter(([, source]) => /\bthis\.direction\b/.test(source))
      .map(([name]) => name);
    expect(
      offenders,
      'derive the heading from `destination - position`, the way the base class does'
    ).toEqual([]);
  });

  it('never leaves a missile that hits, dies, and leaves nothing behind', () => {
    // The dissipation rule, in the one form a scan can state without lying.
    // A missile that lands is allowed to be removed — but then *something*
    // has to carry the moment on: an aftermath object, a lingering zone, a
    // grip. A file that hits, does not survive its hit (`removeOnMaxHit`),
    // and constructs nothing at all is the "đột nhiên biến mất" failure with
    // no room for anything else to be true.
    //
    // Checked file-wide rather than inside `onHit` on purpose — see this
    // file's header for the measurement that decided it.
    const offenders = [...sources]
      .filter(([, source]) => isMissile(source) && /\bonHit\s*\(/.test(source))
      .filter(([, source]) => {
        const survivesItsHit = /removeOnMaxHit\s*=\s*false/.test(source);
        const handsOff = /objectManager\.addObject\(/.test(source);
        return !survivesItsHit && !handsOff;
      })
      .map(([name]) => name);
    expect(
      offenders,
      'set `removeOnMaxHit = false` and fade, or spawn something that owns the aftermath'
    ).toEqual([]);
  });

  it('never uses a p5 global the test harness does not provide', () => {
    // `stubGameGlobals` stubs `TWO_PI` and not `HALF_PI`, so a spell reaching
    // for the second one is a spell that cannot be driven by a test — it dies
    // with "HALF_PI is not defined" the moment anything touches that path,
    // and only in the tests, never in the game. The value is not in doubt:
    // write `Math.PI / 2`.
    //
    // Kept as a named list rather than "any capitalised global" because the
    // point is *which globals the harness has*, and that is a fact about the
    // harness, not a style rule.
    const UNSTUBBED = ['HALF_PI', 'QUARTER_PI', 'PI'];
    const offenders: string[] = [];
    for (const [name, source] of sources) {
      for (const global of UNSTUBBED) {
        if (new RegExp(`(?<![.\\w])${global}\\b`).test(source)) {
          offenders.push(`${name}: ${global}`);
        }
      }
    }
    expect(offenders, 'use Math.PI instead — p5 globals only exist in a live sketch').toEqual([]);
  });

  it('never reads the raw cursor — a thumb is not a cursor', () => {
    // The same rule `chargeAim.test.ts` states from the other side, kept here
    // so the whole VFX checklist is readable in one file. `Spell.aimPoint` is
    // the only thing that knows a drag from a finger pressing a button.
    const offenders = [...sources]
      .filter(([, source]) => source.includes('worldMouse'))
      .map(([name]) => name);
    expect(offenders, 'read `Spell.aimPoint` and push the answer into the effect').toEqual([]);
  });
});
