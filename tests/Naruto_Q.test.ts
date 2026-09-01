/**
 * Rasengan — the pack's worked example for `docs/VFX_STANDARD.md`'s phases
 * rule, so what is pinned here is the *shape* as much as the numbers.
 *
 * The ability it replaced was the anti-pattern the rule was written about: a
 * sphere that appeared, dealt its damage on contact, and stopped existing on
 * the same frame. Reported from a real match as "đột nhiên xuất hiện rồi đột
 * nhiên biến mất gây damage".
 *
 * So three of these tests are about time, not about damage: that the charge
 * is visible while it is being held, that the burst outlives the missile, and
 * that the vortex does not bite before it has drawn the radius it bites in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, createGame, stubGameGlobals, type TestGame } from '@moba2d/core/testing';
import { pressSpell, releaseSpell } from '@moba2d/core/testing/spell';
import Naruto_Q, {
  Naruto_Q_Object,
  Q_CHARGE_MS,
  Q_MAX_DAMAGE,
  Q_MAX_VORTEX,
  Q_MIN_DAMAGE,
  Q_MIN_VORTEX,
  chargedDamage,
  chargedRadius,
  chargedVortex,
} from '../spells/Naruto_Q';
import { Naruto_Q_Charge } from '../spells/Naruto_Q_Charge';
import {
  Naruto_Q_Vortex,
  VORTEX_FADE_MS,
  VORTEX_GROW_MS,
  VORTEX_HOLD_MS,
} from '../spells/Naruto_Q_Vortex';
import { champion, indexObjects, unit } from './_units';

let game: TestGame;

const naruto = () => {
  const caster = champion(game, 0, 'blue');
  caster.replaceSpells([new Naruto_Q(caster)]);
  return caster;
};

/** Everything the world is holding, including this tick's arrivals. */
const inWorld = <T>(kind: new (...args: never[]) => T): T[] =>
  [
    ...(game.objectManager.objects as unknown[]),
    ...((game.objectManager as { _objectToBeAdd?: unknown[] })._objectToBeAdd ?? []),
  ].filter(o => o instanceof kind) as T[];

const tick = (objects: { update(): void }[], ms: number): void => {
  vi.stubGlobal('deltaTime', ms);
  for (const object of objects) object.update();
};

beforeEach(() => {
  stubGameGlobals();
  vi.stubGlobal('deltaTime', 16);
  game = createGame(2_000);
  game.setPlayer(champion(game, 0, 'player-uuid'));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Rasengan scaling', () => {
  it('reads damage and both radii off one ratio', () => {
    // One ratio, three curves, so a retune cannot make the sphere grow while
    // the damage stays flat — which is the tooltip lying by omission.
    expect(chargedDamage(0)).toBe(Q_MIN_DAMAGE);
    expect(chargedDamage(1)).toBe(Q_MAX_DAMAGE);
    expect(chargedVortex(0)).toBe(Q_MIN_VORTEX);
    expect(chargedVortex(1)).toBe(Q_MAX_VORTEX);
    expect(chargedRadius(0.5)).toBeGreaterThan(chargedRadius(0));
  });

  it('clamps a ratio the runtime never should have sent', () => {
    expect(chargedDamage(-1)).toBe(Q_MIN_DAMAGE);
    expect(chargedDamage(4)).toBe(Q_MAX_DAMAGE);
  });
});

describe('Rasengan charge', () => {
  it('puts a visible sphere in the world while the key is held', () => {
    // The enemy's half of the ability: a charged burst with no growing tell
    // is a burst with no counterplay.
    const caster = naruto();
    indexObjects(game, [caster]);

    pressSpell(caster.spells[0], { at: { x: 400, y: 0 } });

    expect(inWorld(Naruto_Q_Charge)).toHaveLength(1);
  });

  it('grows the sphere with the hold', () => {
    const caster = naruto();
    indexObjects(game, [caster]);
    pressSpell(caster.spells[0], { at: { x: 400, y: 0 } });
    const forming = inWorld(Naruto_Q_Charge)[0];
    expect(forming.ratio).toBe(0);

    tick([caster.spells[0]], Q_CHARGE_MS / 2);

    expect(forming.ratio).toBeGreaterThan(0);
  });

  it('takes the sphere away when the hold is released', () => {
    // An orphan here is a sphere that hangs at his hand for the rest of the
    // match, and nothing else would ever remove it.
    const caster = naruto();
    indexObjects(game, [caster]);
    pressSpell(caster.spells[0], { at: { x: 400, y: 0 } });
    releaseSpell(caster.spells[0], { at: { x: 400, y: 0 } });

    expect(inWorld(Naruto_Q_Charge).every(o => o.toRemove)).toBe(true);
  });

  it('throws a bigger sphere for a longer hold', () => {
    const caster = naruto();
    indexObjects(game, [caster]);

    pressSpell(caster.spells[0], { at: { x: 400, y: 0 } });
    releaseSpell(caster.spells[0], { at: { x: 400, y: 0 } });
    const tapped = inWorld(Naruto_Q_Object)[0];

    const second = naruto();
    indexObjects(game, [second]);
    pressSpell(second.spells[0], { at: { x: 400, y: 0 } });
    tick([second.spells[0]], Q_CHARGE_MS);
    releaseSpell(second.spells[0], { at: { x: 400, y: 0 } });
    const held = inWorld(Naruto_Q_Object).find(o => o !== tapped)!;

    expect(held.damage).toBeGreaterThan(tapped.damage);
    expect(held.size).toBeGreaterThan(tapped.size);
    expect(held.vortexRadius).toBeGreaterThan(tapped.vortexRadius);
  });
});

describe('Rasengan burst', () => {
  it('leaves a vortex behind instead of simply vanishing', () => {
    // The phases rule, as a test. The missile is spent on contact; the thing
    // that carries the *reading* of what happened outlives it.
    const caster = naruto();
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const shot = new Naruto_Q_Object(caster);
    shot.position.set(200, 0);
    shot.damage = 30;
    shot.vortexRadius = 120;
    shot.onHit(victim);

    expect(inWorld(Naruto_Q_Vortex)).toHaveLength(1);
  });

  it('bursts on arrival too, not only on a body', () => {
    // A throw that reaches its range without touching anyone still ground a
    // sphere into the floor; the player aimed at that spot for a reason.
    const caster = naruto();
    indexObjects(game, [caster]);

    const shot = new Naruto_Q_Object(caster);
    shot.position.set(300, 0);
    shot.onRemoved();

    expect(inWorld(Naruto_Q_Vortex)).toHaveLength(1);
  });

  it('bursts once even if contact and removal both fire', () => {
    const caster = naruto();
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const shot = new Naruto_Q_Object(caster);
    shot.position.set(200, 0);
    shot.onHit(victim);
    shot.onRemoved();

    expect(inWorld(Naruto_Q_Vortex)).toHaveLength(1);
  });
});

describe('the vortex', () => {
  const plant = (caster: ReturnType<typeof naruto>, victim: ReturnType<typeof unit>) => {
    const vortex = new Naruto_Q_Vortex(caster);
    vortex.position.set(victim.position.x, victim.position.y);
    vortex.radius = 140;
    vortex.damage = 30;
    vortex.onAdded();
    return vortex;
  };

  it('does not bite before it has drawn the radius it bites in', () => {
    // Damage on spawn would be damage the victim could not have read — the
    // area has to exist on screen before it means anything.
    const caster = naruto();
    const victim = unit(game, 0, 'red');
    indexObjects(game, [caster, victim]);
    const vortex = plant(caster, victim);
    const before = victim.stats.health.baseValue;

    tick([vortex], VORTEX_GROW_MS - 20);
    expect(victim.stats.health.baseValue).toBe(before);

    tick([vortex], 40);
    expect(victim.stats.health.baseValue).toBeLessThan(before);
  });

  it('bites exactly once however long it lingers', () => {
    const caster = naruto();
    const victim = unit(game, 0, 'red');
    indexObjects(game, [caster, victim]);
    const vortex = plant(caster, victim);

    tick([vortex], VORTEX_GROW_MS + 10);
    const afterFirst = victim.stats.health.baseValue;
    for (let step = 0; step < 8; step++) tick([vortex], 60);

    expect(victim.stats.health.baseValue).toBe(afterFirst);
  });

  it('slows what it caught', () => {
    const caster = naruto();
    const victim = unit(game, 0, 'red');
    indexObjects(game, [caster, victim]);
    const vortex = plant(caster, victim);

    tick([vortex], VORTEX_GROW_MS + 10);

    // By class, not by name: a display string is a translation away from
    // making this pass over a champion that was never slowed.
    const Slow = buildTestApi().buffs.Slow;
    expect(victim.buffs.some(buff => buff instanceof Slow)).toBe(true);
  });

  it('stays for its whole fade, then goes', () => {
    // The dissipation phase, as a duration. Removing it the moment it bites
    // would put the ability straight back where it started.
    const caster = naruto();
    const victim = unit(game, 0, 'red');
    indexObjects(game, [caster, victim]);
    const vortex = plant(caster, victim);

    tick([vortex], VORTEX_GROW_MS + VORTEX_HOLD_MS + 10);
    expect(vortex.toRemove).toBe(false);

    tick([vortex], VORTEX_FADE_MS);
    expect(vortex.toRemove).toBe(true);
  });
});
