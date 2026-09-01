/**
 * Kurama Mode — the pack's half of the engine's first transforming ultimate.
 *
 * Core owns whether a stance swaps the right slots and hands back the right
 * instances (`ChampionStance.test.ts` over there). What is this pack's to get
 * right is the *contract around* it: that the form actually holds the three
 * Kurama abilities, that it ends on its own clock, that it ends when the
 * chakra runs out, and — the one that would go unnoticed longest — that a
 * champion who dies mid-form does not respawn still transformed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, stubGameGlobals, type TestGame } from '@moba2d/core/testing';
import { pressSpell } from '@moba2d/core/testing/spell';
import Naruto_R, {
  KURAMA_STANCE,
  R_CHAKRA_PER_SECOND,
  R_DURATION_MS,
  R_HEALTH_BONUS,
} from '../spells/Naruto_R';
import { KuramaAura } from '../spells/Naruto_R_Aura';
import Naruto_Q2 from '../spells/Naruto_Q2';
import Naruto_W2 from '../spells/Naruto_W2';
import Naruto_E2 from '../spells/Naruto_E2';
import Naruto_Q from '../spells/Naruto_Q';
import Naruto_W from '../spells/Naruto_W';
import Naruto_E from '../spells/Naruto_E';
import { champion, indexObjects } from './_units';

let game: TestGame;

/** Naruto with his real base kit in slots 0-2 and the ultimate in slot 3. */
/**
 * The engine's real pool, not the 100 `_units.ts` sets for damage tests.
 * `Stats.ts` defaults mana to 500 and `ChampionDefenceTuning` has no mana
 * field, so 500 is what every champion in every pack actually has — and the
 * upkeep below is only honest against that number.
 */
const REAL_MANA = 500;

const naruto = () => {
  const unit = champion(game, 0, 'blue');
  unit.replaceSpells([
    new Naruto_Q(unit),
    new Naruto_W(unit),
    new Naruto_E(unit),
    new Naruto_R(unit),
  ]);
  unit.stats.mana.baseValue = REAL_MANA;
  unit.stats.maxMana.baseValue = REAL_MANA;
  return unit;
};

/** Runs the champion's own spell loop, which is where the drain lives. */
const advance = (unit: ReturnType<typeof naruto>, ms: number): void => {
  vi.stubGlobal('deltaTime', ms);
  for (const spell of unit.spells) spell.update();
  for (const buff of [...unit.buffs]) buff.update();
};

beforeEach(() => {
  stubGameGlobals();
  vi.stubGlobal('deltaTime', 16);
  game = createGame(2_000);
  // `indexObjects` reads `getDisplayBoundingBox`, which for a champion asks
  // `isAllied`, which asks the world for its player. Without one the world
  // throws on the first champion indexed.
  game.setPlayer(champion(game, 0, 'player-uuid'));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Kurama Mode', () => {
  it('swaps Q, W and E for the Kurama abilities and leaves R alone', () => {
    const unit = naruto();
    const ultimate = unit.spells[3];
    indexObjects(game, [unit]);

    pressSpell(unit.spells[3], { at: { x: 0, y: 0 } });

    expect(unit.stance).toBe(KURAMA_STANCE);
    expect(unit.spells.map(spell => spell.name)).toEqual([
      'Bijuu Rasengan',
      'Kurama Arms',
      'Bijuudama',
      'Kurama Mode',
    ]);
    expect(unit.spells[3]).toBe(ultimate);
  });

  it('gives the base kit back when the form runs out', () => {
    const unit = naruto();
    const base = [...unit.spells];
    indexObjects(game, [unit]);
    pressSpell(unit.spells[3], { at: { x: 0, y: 0 } });

    // Chakra is topped up each step so this test measures the *clock* and not
    // the drain — the two endings are separate tests on purpose.
    for (let elapsed = 0; elapsed <= R_DURATION_MS; elapsed += 1_000) {
      unit.stats.mana.baseValue = REAL_MANA;
      advance(unit, 1_000);
    }

    expect(unit.stance).toBe(null);
    expect(unit.spells).toEqual(base);
  });

  it('ends the form when the pool runs out, before the clock does', () => {
    const unit = naruto();
    indexObjects(game, [unit]);
    pressSpell(unit.spells[3], { at: { x: 0, y: 0 } });
    // The cast already billed `R_CHAKRA`; leave barely two seconds of upkeep.
    unit.stats.mana.baseValue = R_CHAKRA_PER_SECOND * 2;

    for (let elapsed = 0; elapsed < 4_000; elapsed += 1_000) advance(unit, 1_000);

    expect(unit.stance).toBe(null);
  });

  it('reaches the full duration on the real pool if he casts nothing', () => {
    // Half of what the retune is for. The first cut charged 6/s against a
    // 500 pool, so running dry was arithmetically impossible and the form
    // always ended on the timer — the tooltip promised an ending that could
    // not happen. This end has to stay reachable too.
    const unit = naruto();
    indexObjects(game, [unit]);
    pressSpell(unit.spells[3], { at: { x: 0, y: 0 } });

    for (let elapsed = 0; elapsed < R_DURATION_MS - 1_000; elapsed += 1_000) {
      advance(unit, 1_000);
    }

    expect(unit.stance).toBe(KURAMA_STANCE);
    expect(unit.stats.mana.value).toBeGreaterThan(0);
  });

  it('runs the pool dry early when he actually uses the form', () => {
    // The other half, and the sentence the tooltip now makes: casting inside
    // the form shortens it. Q2 + W2 + E2 on top of the upkeep is more than
    // what is left after the ultimate's own cost.
    const unit = naruto();
    indexObjects(game, [unit]);
    pressSpell(unit.spells[3], { at: { x: 0, y: 0 } });
    expect(unit.stance).toBe(KURAMA_STANCE);

    const formCosts =
      new Naruto_Q2(unit).manaCost + new Naruto_W2(unit).manaCost + new Naruto_E2(unit).manaCost;
    unit.stats.mana.baseValue -= formCosts;

    let elapsed = 0;
    while (elapsed < R_DURATION_MS && unit.stance !== null) {
      advance(unit, 1_000);
      elapsed += 1_000;
    }

    expect(unit.stance).toBe(null);
    expect(elapsed).toBeLessThan(R_DURATION_MS);
  });

  it('drains chakra a second at a time rather than every frame', () => {
    const unit = naruto();
    indexObjects(game, [unit]);
    pressSpell(unit.spells[3], { at: { x: 0, y: 0 } });
    unit.stats.mana.baseValue = REAL_MANA;

    // Half a second of frames must cost nothing at all: a drain that billed
    // per frame would be sixty times the tooltip.
    for (let frame = 0; frame < 30; frame++) advance(unit, 16);
    expect(unit.stats.mana.value).toBe(REAL_MANA);

    advance(unit, 1_000);
    expect(unit.stats.mana.value).toBe(REAL_MANA - R_CHAKRA_PER_SECOND);
  });

  it('does not leave a dead champion transformed', () => {
    // The case that would go unnoticed longest: a form is a buff, and buffs
    // are stripped on death, so this must come out of the engine for free —
    // but nothing proves it until something asks.
    const unit = naruto();
    indexObjects(game, [unit]);
    pressSpell(unit.spells[3], { at: { x: 0, y: 0 } });
    expect(unit.stance).toBe(KURAMA_STANCE);

    unit.takeDamage(9_999, unit);

    expect(unit.isDead).toBe(true);
    expect(unit.stance).toBe(null);
  });

  it('changes the face so the form is legible off the portrait', () => {
    // A transformed champion that looks untransformed is a fifteen-second
    // window the enemy cannot read — reported from a real match as "bật R lên
    // avatar không đổi".
    const unit = naruto();
    indexObjects(game, [unit]);
    const before = unit.avatar;

    pressSpell(unit.spells[3], { at: { x: 0, y: 0 } });
    expect(unit.avatar).not.toBe(before);

    for (let elapsed = 0; elapsed <= R_DURATION_MS; elapsed += 1_000) {
      unit.stats.mana.baseValue = REAL_MANA;
      advance(unit, 1_000);
    }
    expect(unit.avatar).toBe(before);
  });

  it('puts a cloak in the world, and takes it away with the form', () => {
    // In the world and not on the body: `Champion.draw()` is skipped for a
    // culled or fogged caster, and the viewer who most needs to see the form
    // is the one across the wall.
    const unit = naruto();
    indexObjects(game, [unit]);

    pressSpell(unit.spells[3], { at: { x: 0, y: 0 } });
    // Both lists: a unit added this tick sits in `_objectToBeAdd` until the
    // manager flushes, which is the same distinction `HostSession.stillQueued`
    // already has to make.
    // Annotated rather than inferred: `KuramaAura` extends `api.SpellObject`,
    // whose type comes off the runtime api object, so a `o is KuramaAura`
    // predicate does not narrow an `unknown[]` here.
    const cloaks = (): KuramaAura[] =>
      [
        ...(game.objectManager.objects as unknown[]),
        ...((game.objectManager as { _objectToBeAdd?: unknown[] })._objectToBeAdd ?? []),
      ].filter(o => o instanceof KuramaAura) as KuramaAura[];
    expect(cloaks()).toHaveLength(1);

    for (let elapsed = 0; elapsed <= R_DURATION_MS; elapsed += 1_000) {
      unit.stats.mana.baseValue = REAL_MANA;
      advance(unit, 1_000);
    }
    // The cloak watches the buff, so it marks itself gone rather than waiting
    // for anyone to remember to remove it.
    for (const cloak of cloaks()) cloak.update();
    expect(cloaks().every(cloak => cloak.toRemove)).toBe(true);
  });

  it('raises the health ceiling and lowers it again without killing him', () => {
    const unit = naruto();
    indexObjects(game, [unit]);
    const ceiling = unit.stats.maxHealth.value;

    pressSpell(unit.spells[3], { at: { x: 0, y: 0 } });
    expect(unit.stats.maxHealth.value).toBe(ceiling + R_HEALTH_BONUS);

    // Standing at the raised ceiling when the form ends is the case that
    // needs the clamp — without it he walks out reading more health than he
    // can hold.
    unit.stats.health.baseValue = unit.stats.maxHealth.value;
    for (let elapsed = 0; elapsed <= R_DURATION_MS; elapsed += 1_000) {
      unit.stats.mana.baseValue = REAL_MANA;
      advance(unit, 1_000);
    }

    expect(unit.stats.maxHealth.value).toBe(ceiling);
    expect(unit.stats.health.baseValue).toBe(ceiling);
    expect(unit.isDead).toBe(false);
  });
});
