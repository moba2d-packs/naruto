/**
 * The Kurama-form abilities' endings.
 *
 * Both of these shipped without a dissipation phase, which is the same defect
 * `docs/VFX_STANDARD.md`'s phases section was written about: Bijuu Rasengan
 * detonated and left the floor clean, and Bijuudama pierced whatever was on
 * the line and then blinked out at maximum range. In both cases the only
 * evidence the ability had a size was a damage number.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, stubGameGlobals, type TestGame } from '@moba2d/core/testing';
import { Naruto_Q2_Object } from '../spells/Naruto_Q2';
import { Naruto_Q2_Scorch, SCORCH_FADE_MS, SCORCH_GROW_MS, SCORCH_HOLD_MS } from '../spells/Naruto_Q2_Scorch';
import { Naruto_E2_Object } from '../spells/Naruto_E2';
import { BOOM_GROW_MS, Naruto_E2_Detonation } from '../spells/Naruto_E2_Detonation';
import { champion, indexObjects, unit } from './_units';
import Naruto_Q2, { Q2_CHARGE_MS, Q2_RANGE, q2Damage, q2Range } from '../spells/Naruto_Q2';
import Naruto_E2, { E2_CHARGE_MS, E2_RANGE, e2Damage, e2Range } from '../spells/Naruto_E2';

let game: TestGame;

const inWorld = <T>(kind: new (...args: never[]) => T): T[] =>
  [
    ...(game.objectManager.objects as unknown[]),
    ...((game.objectManager as { _objectToBeAdd?: unknown[] })._objectToBeAdd ?? []),
  ].filter(o => o instanceof kind) as T[];

const tick = (object: { update(): void }, ms: number): void => {
  vi.stubGlobal('deltaTime', ms);
  object.update();
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

describe('Bijuu Rasengan', () => {
  it('leaves scorched ground where it burst', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const shot = new Naruto_Q2_Object(caster);
    shot.position.set(200, 0);
    shot.onHit(victim);

    expect(inWorld(Naruto_Q2_Scorch)).toHaveLength(1);
  });

  it('bursts when it reaches its range, having hit nobody', () => {
    // Found by throwing one at an empty lane: it simply stopped existing.
    // The player aimed at that spot for a reason, and got no answer.
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    const shot = new Naruto_Q2_Object(caster);
    shot.position.set(400, 0);
    shot.onRemoved();

    expect(inWorld(Naruto_Q2_Scorch)).toHaveLength(1);
  });

  it('bursts once even if contact and removal both fire', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const shot = new Naruto_Q2_Object(caster);
    shot.position.set(200, 0);
    shot.onHit(victim);
    shot.onRemoved();

    expect(inWorld(Naruto_Q2_Scorch)).toHaveLength(1);
  });

  it('holds the mark long enough to read, then clears it', () => {
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);
    const scorch = new Naruto_Q2_Scorch(caster);
    scorch.onAdded();

    tick(scorch, SCORCH_GROW_MS + SCORCH_HOLD_MS + 10);
    expect(scorch.toRemove).toBe(false);

    tick(scorch, SCORCH_FADE_MS);
    expect(scorch.toRemove).toBe(true);
  });
});

describe('Bijuudama', () => {
  it('detonates where it stops rather than blinking out', () => {
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    const bomb = new Naruto_E2_Object(caster);
    bomb.position.set(400, 0);
    bomb.onRemoved();

    expect(inWorld(Naruto_E2_Detonation)).toHaveLength(1);
  });

  it('detonates once however many times it is removed', () => {
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    const bomb = new Naruto_E2_Object(caster);
    bomb.onRemoved();
    bomb.onRemoved();

    expect(inWorld(Naruto_E2_Detonation)).toHaveLength(1);
  });

  it('spares whoever the sphere already pierced', () => {
    // Being hit by the shot and then by the crater it makes is one ability
    // charging twice for one dodge, and the tooltip does not say that.
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 0, 'red');
    indexObjects(game, [caster, victim]);

    const boom = new Naruto_E2_Detonation(caster);
    boom.position.set(0, 0);
    boom.spare = [victim];
    boom.onAdded();
    const before = victim.stats.health.baseValue;

    tick(boom, BOOM_GROW_MS + 20);

    expect(victim.stats.health.baseValue).toBe(before);
  });

  it('still catches everyone it did not pierce', () => {
    const caster = champion(game, 0, 'blue');
    const bystander = unit(game, 0, 'red');
    indexObjects(game, [caster, bystander]);

    const boom = new Naruto_E2_Detonation(caster);
    boom.position.set(0, 0);
    boom.onAdded();
    const before = bystander.stats.health.baseValue;

    tick(boom, BOOM_GROW_MS + 20);

    expect(bystander.stats.health.baseValue).toBeLessThan(before);
  });

  it('does not bite before it has drawn its radius', () => {
    const caster = champion(game, 0, 'blue');
    const bystander = unit(game, 0, 'red');
    indexObjects(game, [caster, bystander]);

    const boom = new Naruto_E2_Detonation(caster);
    boom.position.set(0, 0);
    boom.onAdded();
    const before = bystander.stats.health.baseValue;

    tick(boom, BOOM_GROW_MS - 30);

    expect(bystander.stats.health.baseValue).toBe(before);
  });
});

describe('the form’s two thrown abilities charge', () => {
  /**
   * The base Q is a hold. Before this, entering Kurama Mode turned it into a
   * tap — so the form changed how the button *feels* as well as what it does,
   * and the one thing a form should not do is take an interaction away.
   *
   * Both ends are asserted deliberately. A charge that is *required* for the
   * ability to work at all is not a choice, it is a delay; and a charge that
   * buys nothing is a wait. So the floor has to be worth pressing and the
   * ceiling has to be worth holding for.
   */
  it.each([
    ['Bijuu Rasengan', Naruto_Q2, Q2_CHARGE_MS],
    ['Bijuudama', Naruto_E2, E2_CHARGE_MS],
  ])('%s is held, not tapped', (_name, spell, windowMs) => {
    const charge = spell.prototype.castSpec.charge;
    expect(spell.prototype.castSpec.activation).toBe('HOLD_RELEASE');
    expect(charge?.maxDurationMs).toBe(windowMs);
    // Fires at the top rather than cancelling there — which is also what lets
    // a bot hold to full charge safely. See `Spell.aiChargeReleaseAtMs`.
    expect(charge?.releaseAtMax).toBe(true);
  });

  it('buys both power and reach, and reaches no further than the band allows', () => {
    expect(q2Damage(1)).toBeGreaterThan(q2Damage(0));
    expect(e2Damage(1)).toBeGreaterThan(e2Damage(0));
    expect(q2Range(1)).toBeGreaterThan(q2Range(0));
    expect(e2Range(1)).toBeGreaterThan(e2Range(0));
    // The ceiling is the band slot the range suite already pins, so a charge
    // cannot quietly out-reach what the pack says the ability is.
    expect(q2Range(1)).toBe(Q2_RANGE);
    expect(e2Range(1)).toBe(E2_RANGE);
  });

  it('never asks the player to charge just to be usable', () => {
    // A tapped throw is still a real throw: both floors clear a caster
    // minion, which `waveclear.test.ts` states in its own terms.
    expect(q2Damage(0)).toBeGreaterThan(0);
    expect(e2Damage(0)).toBeGreaterThan(q2Damage(1));
  });
});
