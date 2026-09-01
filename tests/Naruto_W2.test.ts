/**
 * Kurama Arms — the ability is a *grab*, so what is pinned here is that the
 * limb behaves like one.
 *
 * The first cut vanished on contact and let the victim slide in behind it,
 * which is `docs/VFX_STANDARD.md` rule 4 broken outright: the art said the
 * arm was gone while the game was still dragging someone with it. The arm now
 * has to survive its own hit, ride the victim in, and only then leave.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, createGame, stubGameGlobals, type TestGame } from '@moba2d/core/testing';
import { Naruto_W2_Object, W2_RETRACT_MS } from '../spells/Naruto_W2';
import { champion, indexObjects, unit } from './_units';

let game: TestGame;

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

describe('Kurama Arms', () => {
  it('does not vanish on the hit it lands', () => {
    // It is still holding someone. An arm that deletes itself here is the
    // rule-4 break the rework exists for.
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const arm = new Naruto_W2_Object(caster);
    arm.position.set(200, 0);
    arm.onHit(victim);

    expect(arm.toRemove).toBe(false);
  });

  it('pulls the victim toward the caster', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);
    const Dash = buildTestApi().buffs.Dash;

    const arm = new Naruto_W2_Object(caster);
    arm.position.set(200, 0);
    arm.onHit(victim);

    const reel = victim.buffs.find(buff => buff instanceof Dash);
    expect(reel).toBeDefined();
  });

  it('rides the victim in rather than staying where it struck', () => {
    // This is what makes the limb visibly shorten: the hand is on them.
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const arm = new Naruto_W2_Object(caster);
    arm.position.set(200, 0);
    arm.onHit(victim);
    victim.position.set(120, 0);
    tick(arm, 16);

    expect(arm.position.x).toBe(120);
  });

  it('lets go once the reeling is done', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const arm = new Naruto_W2_Object(caster);
    arm.position.set(200, 0);
    arm.onHit(victim);
    tick(arm, W2_RETRACT_MS + 20);

    expect(arm.toRemove).toBe(true);
  });

  it('comes back even when it caught nobody', () => {
    // Without this the arm hangs at full stretch at the end of its range for
    // the rest of the match.
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    const arm = new Naruto_W2_Object(caster);
    arm.destination.set(700, 0);
    for (let step = 0; step < 200 && !arm.toRemove; step++) tick(arm, 16);

    expect(arm.toRemove).toBe(true);
  });
});
