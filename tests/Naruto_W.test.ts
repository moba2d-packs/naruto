/**
 * Kage Bunshin — the tests are mostly about *not being distinguishable*,
 * because that is the ability.
 *
 * The first cut failed on both halves at once: one-hit clones (weaker than
 * Shaco's or Zed's) wearing core's deliberately-subordinate summon frame, so
 * they died instantly and nobody ever had to guess. Every assertion below is
 * one of the tells that made that true.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, createGame, stubGameGlobals, type TestGame } from '@moba2d/core/testing';
import { pressSpell } from '@moba2d/core/testing/spell';
import Naruto_W, { Naruto_W_Clone, W_CLONES, W_CLONE_DAMAGE_TAKEN } from '../spells/Naruto_W';
import { Naruto_W_Smoke } from '../spells/Naruto_W_Smoke';
import { champion, indexObjects } from './_units';

let game: TestGame;

const naruto = () => {
  const caster = champion(game, 0, 'blue');
  caster.name = 'Naruto Uzumaki';
  caster.replaceSpells([new Naruto_W(caster)]);
  return caster;
};

const inWorld = <T>(kind: new (...args: never[]) => T): T[] =>
  [
    ...(game.objectManager.objects as unknown[]),
    ...((game.objectManager as { _objectToBeAdd?: unknown[] })._objectToBeAdd ?? []),
  ].filter(o => o instanceof kind) as T[];

beforeEach(() => {
  stubGameGlobals();
  vi.stubGlobal('deltaTime', 16);
  game = createGame(2_000);
  game.setPlayer(champion(game, 0, 'player-uuid'));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Kage Bunshin', () => {
  it('puts smoke down to cover the swap', () => {
    // Without it the enemy's eye simply follows the body that never moved,
    // and the other two are decoration.
    const caster = naruto();
    indexObjects(game, [caster]);

    pressSpell(caster.spells[0]);

    expect(inWorld(Naruto_W_Smoke).length).toBeGreaterThan(0);
  });

  it('hides him, and makes him unclickable while hidden', () => {
    // Two different questions. Stealth alone leaves a hole in the smoke where
    // he used to be — perfectly targetable, which answers "which one is real"
    // for free.
    const caster = naruto();
    indexObjects(game, [caster]);
    const { Invisible, Untargetable } = buildTestApi().buffs;

    pressSpell(caster.spells[0]);

    expect(caster.buffs.some(buff => buff instanceof Invisible)).toBe(true);
    expect(caster.buffs.some(buff => buff instanceof Untargetable)).toBe(true);
  });

  it('spawns the clones', () => {
    const caster = naruto();
    indexObjects(game, [caster]);

    pressSpell(caster.spells[0]);

    expect(inWorld(Naruto_W_Clone)).toHaveLength(W_CLONES);
  });

  it('gives a clone his portrait, his name and his health numbers', () => {
    // The bar over its head has to read the same as the bar over his. A pool
    // scaled to a fraction announces itself the moment anyone looks at it.
    const caster = naruto();
    indexObjects(game, [caster]);
    caster.stats.health.baseValue = 317;

    pressSpell(caster.spells[0]);
    const clone = inWorld(Naruto_W_Clone)[0];

    expect(clone.name).toBe(caster.name);
    expect(clone.stats.maxHealth.value).toBe(caster.stats.maxHealth.value);
    expect(clone.stats.health.value).toBe(caster.stats.health.value);
    expect(clone.stats.size.value).toBe(caster.stats.size.value);
  });

  it('wears the champion frame, not the summon frame', () => {
    // Core draws a pet as visibly subordinate on purpose — 52px of bar and no
    // buff row. Both are tells, and a decoy has to opt out of both.
    const caster = naruto();
    indexObjects(game, [caster]);
    pressSpell(caster.spells[0]);
    const clone = inWorld(Naruto_W_Clone)[0] as unknown as {
      compactBarWidth: number;
      compactShowsBuffIcons: boolean;
    };

    expect(clone.compactBarWidth).toBe(88);
    expect(clone.compactShowsBuffIcons).toBe(true);
  });

  it('dies faster than it looks, which is the trade', () => {
    // It carries his numbers and takes triple damage: a few hits, not one,
    // and the enemy only finds out by committing to it.
    const caster = naruto();
    indexObjects(game, [caster]);
    pressSpell(caster.spells[0]);
    const clone = inWorld(Naruto_W_Clone)[0];
    const before = clone.stats.health.baseValue;

    clone.takeDamage(20, caster);

    expect(before - clone.stats.health.baseValue).toBe(20 * W_CLONE_DAMAGE_TAKEN);
  });

  it('survives a hit that would have killed the old one-health clone', () => {
    const caster = naruto();
    indexObjects(game, [caster]);
    pressSpell(caster.spells[0]);
    const clone = inWorld(Naruto_W_Clone)[0];

    clone.takeDamage(20, caster);

    expect(clone.isDead).toBe(false);
  });

  it('goes out in smoke rather than falling over', () => {
    const caster = naruto();
    indexObjects(game, [caster]);
    pressSpell(caster.spells[0]);
    const clone = inWorld(Naruto_W_Clone)[0];
    const before = inWorld(Naruto_W_Smoke).length;

    clone.takeDamage(9_999, caster);

    expect(clone.isDead).toBe(true);
    expect(inWorld(Naruto_W_Smoke).length).toBeGreaterThan(before);
  });
});
