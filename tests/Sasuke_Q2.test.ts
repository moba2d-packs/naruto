/**
 * Yasaka Magatama has three phases and looks like a Sharingan.
 *
 * It used to have neither. Three purple triangles appeared in mid-air, dealt
 * damage, and stopped existing — reported as *"lưỡi kiếm hình dấu phẩy? nghe
 * phèn vl, với animation của nó cũng chưa khớp rule"*, and both halves of that
 * were true:
 *
 * - `docs/VFX_STANDARD.md` asks every effect for anticipation, climax and
 *   dissipation. This one had only the middle.
 * - A comma-shaped blade is a shape. Three tomoe in a ring is a *character* —
 *   exactly one champion here has a Sharingan, and the ability was already
 *   named after it.
 *
 * These are structural assertions, not pixel ones: what a `draw()` looks like
 * is answered by `tools/preview-shape.mjs` and by eyes. What a test can hold
 * is that the objects each phase needs actually reach the world, and that the
 * one at the end is not skipped — which is the phase that gets skipped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, createGame, stubGameGlobals, type TestGame } from '@moba2d/core/testing';
import { pressSpell } from '@moba2d/core/testing/spell';
import Sasuke_Q2, { Q2_RING_OFFSET, Sasuke_Q2_Object } from '../spells/Sasuke_Q2';
import { Sasuke_Q2_Ring } from '../spells/Sasuke_Q2_Ring';
import { Sasuke_Q2_Ember } from '../spells/Sasuke_Q2_Ember';
import { basicAttackStub, champion, indexObjects } from './_units';

const SLOT = buildTestApi().enums.SpellSlot;
let game: TestGame;

beforeEach(() => {
  stubGameGlobals();
  vi.stubGlobal('deltaTime', 16);
  game = createGame(2_000);
  game.setPlayer(champion(game, 0, 'player-uuid'));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const inWorld = <T>(kind: new (...args: never[]) => T): T[] =>
  [
    ...(game.objectManager.objects as unknown[]),
    ...((game.objectManager as { _objectToBeAdd?: unknown[] })._objectToBeAdd ?? []),
  ].filter(o => o instanceof kind) as T[];

const fire = () => {
  const unit = champion(game, 0, 'blue');
  const spell = new Sasuke_Q2(unit);
  unit.replaceSpells([basicAttackStub(unit), spell, spell, spell, spell]);
  indexObjects(game, [unit]);
  pressSpell(unit.spells[SLOT.Q], { at: { x: 400, y: 0 } });
  return unit;
};

describe('the eye opens before anything leaves', () => {
  it('puts a ring in the world, once', () => {
    fire();
    expect(inWorld(Sasuke_Q2_Ring)).toHaveLength(1);
  });

  it('stands it in front of him, pointed where the blades go', () => {
    // In front rather than on him: it is what the tomoe come *out of*, so it
    // has to sit where they leave from.
    const unit = fire();
    const ring = inWorld(Sasuke_Q2_Ring)[0];
    expect(Math.round(ring.position.x - unit.position.x)).toBe(Q2_RING_OFFSET);
    expect(Math.round(ring.heading)).toBe(0);
  });

  it('still fires all three tomoe', () => {
    // The telegraph is animation, not a cast time — the spread is the
    // ability and it must not have quietly become a slower one.
    fire();
    expect(inWorld(Sasuke_Q2_Object)).toHaveLength(3);
  });
});

describe('and something is left where each one stopped', () => {
  it('unwinds into embers rather than vanishing', () => {
    // The phase that gets skipped. A piercing blade is the one shot whose
    // flight never says where it ended — every other ability in this kit
    // ends on a body.
    fire();
    const blade = inWorld(Sasuke_Q2_Object)[0];
    expect(inWorld(Sasuke_Q2_Ember)).toHaveLength(0);

    blade.onRemoved();

    expect(inWorld(Sasuke_Q2_Ember)).toHaveLength(1);
  });

  it('does it once, however many ways the runtime removes it', () => {
    // Naruto's Q2 hit exactly this at max range: a cancel arriving after a
    // normal removal, and two endings for one shot.
    fire();
    const blade = inWorld(Sasuke_Q2_Object)[0];

    blade.onRemoved();
    blade.onRemoved();

    expect(inWorld(Sasuke_Q2_Ember)).toHaveLength(1);
  });

  it('leaves the embers where the blade was, not at the caster', () => {
    fire();
    const blade = inWorld(Sasuke_Q2_Object)[0];
    blade.position.set(370, 25);

    blade.onRemoved();

    const ember = inWorld(Sasuke_Q2_Ember)[0];
    expect(Math.round(ember.position.x)).toBe(370);
    expect(Math.round(ember.position.y)).toBe(25);
  });
});
