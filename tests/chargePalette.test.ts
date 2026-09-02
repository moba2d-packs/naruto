/**
 * What you charge is what you throw.
 *
 * `Naruto_Q_Charge` was written for the Rasengan and hard-coded its blue. Both
 * of Kurama Mode's thrown abilities then reused the orb without being told
 * what they were holding — so a player ground a blue sphere between their
 * hands and threw an orange one, and the other one threw purple. Reported
 * exactly that way: "expect màu phải trùng lúc charge và lúc release".
 *
 * Charging and throwing are the same chakra at two moments. The fix is that
 * they now read *one* constant, and this file is what keeps that true: the
 * palette a spell hands the orb has to be the palette its projectile is
 * painted from.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTestApi, createGame, stubGameGlobals, type TestGame } from '@moba2d/core/testing';
import { pressSpell } from '@moba2d/core/testing/spell';
import { BIJUUDAMA_VIOLET, BIJUU_ORANGE, RASENGAN_BLUE } from '../spellVfx';
import Naruto_Q from '../spells/Naruto_Q';
import Naruto_Q2 from '../spells/Naruto_Q2';
import Naruto_E2 from '../spells/Naruto_E2';
import { Naruto_Q_Charge } from '../spells/Naruto_Q_Charge';
import { basicAttackStub, champion, indexObjects } from './_units';

const SLOT = buildTestApi().enums.SpellSlot;
let game: TestGame;

beforeEach(() => {
  stubGameGlobals();
  vi.stubGlobal('deltaTime', 16);
  game = createGame(2_000);
  // `indexObjects` reads `getDisplayBoundingBox`, which for a champion asks
  // `isAllied`, which asks the world for its player. Without one the world
  // throws on the first champion indexed — the same note `Naruto_R.test.ts`
  // carries.
  game.setPlayer(champion(game, 0, 'player-uuid'));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const inWorld = (): Naruto_Q_Charge[] =>
  [
    ...(game.objectManager.objects as unknown[]),
    ...((game.objectManager as { _objectToBeAdd?: unknown[] })._objectToBeAdd ?? []),
  ].filter(o => o instanceof Naruto_Q_Charge) as Naruto_Q_Charge[];

/** Start the hold and read the palette the spell handed the orb. */
const paletteWhileCharging = (Spell: new (owner: never) => unknown) => {
  const unit = champion(game, 0, 'blue');
  const spell = new Spell(unit as never);
  unit.replaceSpells([basicAttackStub(unit), spell as never, spell as never, spell as never, spell as never]);
  indexObjects(game, [unit]);
  pressSpell(unit.spells[SLOT.Q], { at: { x: 400, y: 0 } });
  const orbs = inWorld();
  expect(orbs).toHaveLength(1);
  return orbs[0].palette;
};

describe('the sphere is the colour of the thing it becomes', () => {
  it.each([
    ['Rasengan', Naruto_Q, RASENGAN_BLUE],
    ['Bijuu Rasengan', Naruto_Q2, BIJUU_ORANGE],
    ['Bijuudama', Naruto_E2, BIJUUDAMA_VIOLET],
  ])('%s charges in its own chakra', (_name, Spell, palette) => {
    expect(paletteWhileCharging(Spell as never)).toBe(palette);
  });

  it('gives each ability a chakra of its own', () => {
    // The bug was not a wrong colour, it was *the same* colour three times.
    const glows = [RASENGAN_BLUE, BIJUU_ORANGE, BIJUUDAMA_VIOLET].map(p => p.glow.join(','));
    expect(new Set(glows).size).toBe(3);
  });

  it('leaves the orb a default rather than making every caller remember', () => {
    // A class that demands a palette is a class somebody forgets to hand one
    // to; a class that defaults to the ability it was written for is one that
    // is merely *wrong* until told, which is what happened. The default is
    // kept and the gate above is what makes forgetting visible.
    expect(new Naruto_Q_Charge(champion(game, 0, 'blue') as never).palette).toBe(RASENGAN_BLUE);
  });
});

describe('colours live in the palette, never in a call', () => {
  it('leaves no colour literal in the charged family', () => {
    // The half a runtime check cannot see: a trail built from `'rgba(255,
    // 150, 60, …)'` would look right today and drift the first time the
    // palette is retuned. Both halves have to quote the same source.
    const files = ['Naruto_Q', 'Naruto_Q2', 'Naruto_E2', 'Naruto_Q_Charge'];
    const offenders = files.filter(name =>
      readFileSync(resolve(__dirname, `../spells/${name}.ts`), 'utf8').includes("'rgba(")
    );
    expect(offenders, 'use rgba(PALETTE.glow, alpha) instead').toEqual([]);
  });
});
