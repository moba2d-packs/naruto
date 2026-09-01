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
