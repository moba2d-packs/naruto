import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No spell in this pack may read the cursor directly.
 *
 * A charged ability draws itself while the player holds it — the Rasengan's
 * orb sits at the hand he is aiming with, Indra's Arrow bends its bow across
 * his facing — and both were computing that heading from
 * `owner.game.worldMouse`. On a desktop that is correct by definition: the
 * cursor *is* where the player is pointing.
 *
 * On a phone it is the worst answer available. While a spell is charging the
 * finger is physically pressing that spell's own button, so `worldMouse` is
 * the bottom corner of the screen: the orb swung round behind him and the bow
 * pointed at the HUD. Reported as the ability following the touch instead of
 * the direction picked on the controls.
 *
 * `Spell.aimPoint` is the only thing that knows the difference — core asks
 * `Game.liveAimFor` for the thumb's drag and falls back to the mouse when
 * there is no thumb. So the rule is: **the spell reads `aimPoint`, and pushes
 * the answer down into its own effects.** An effect never goes looking for
 * the cursor itself, because from inside a `SpellObject` there is no way to
 * tell which of the two you are getting.
 *
 * A scan rather than a behaviour test because the failure is invisible on a
 * desktop, which is where these are written — the two that shipped this way
 * both looked perfect in the browser.
 */
const SPELLS = join(__dirname, '../spells');

/** Comments discuss `worldMouse` on purpose; the scan must not flag its own docs. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('charged abilities aim with aimPoint, never the raw cursor', () => {
  const files = readdirSync(SPELLS).filter(name => name.endsWith('.ts'));

  it('has spell files to scan', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('no spell file reads game.worldMouse', () => {
    const offenders = files.filter(name =>
      stripComments(readFileSync(join(SPELLS, name), 'utf8')).includes('worldMouse')
    );
    expect(offenders, `read Spell.aimPoint instead: ${offenders.join(', ')}`).toEqual([]);
  });
});
