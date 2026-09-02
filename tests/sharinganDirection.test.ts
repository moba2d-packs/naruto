/**
 * Sharingan reveals one way, and this file proves it with the real fog.
 *
 * Asked twice from real matches — *"khi kẻ địch mở sharingan, tại sao t vẫn
 * thấy người mở?"*, then more precisely: standing in a bush, beyond the 500px
 * sight radius, the caster appears. That is a question about a *direction*,
 * and a direction is the kind of thing a conversation can only ever be
 * reassuring about. So it lives here instead.
 *
 * Deliberately **no stub**. `Sasuke.test.ts` already checks who gets the
 * `Lộ Diện` buff and which team the granted eye belongs to; those read the
 * pack's own objects. This one runs core's `FogOfWar.calculateSight` end to
 * end and asks the only question the player actually asks: after the cast, is
 * the caster on my screen?
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FogOfWar,
  TeamId,
  buildTestApi,
  createGame,
  indexObjects,
  stubGameGlobals,
  type TestGame,
} from '@moba2d/core/testing';
import { pressSpell } from '@moba2d/core/testing/spell';
import Sasuke_E, { E_REVEAL_RADIUS } from '../spells/Sasuke_E';
import { basicAttackStub } from './_units';

const SLOT = buildTestApi().enums.SpellSlot;
/** The whole world on camera, so the paint half runs for everything. */
const CAMERA = { x: 0, y: 0, w: 2_048, h: 2_048 };
/** Inside the 760 scan and outside a champion's own 500 sight. */
const APART = 700;

let game: TestGame;

beforeEach(() => {
  stubGameGlobals();
  vi.stubGlobal('createGraphics', () => ({ pixelDensity: vi.fn() }));
  vi.stubGlobal('windowWidth', 800);
  vi.stubGlobal('windowHeight', 600);
  vi.stubGlobal('deltaTime', 16);
  game = createGame(2_048);
  (game as unknown as { camera: unknown }).camera = { getBoundingBox: () => CAMERA };
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const scene = () => {
  const Champion = buildTestApi().units.Champion;
  // The player is the one being scanned, which is the side the question is
  // asked from — `visibleToPlayerTeam` is computed from the player's eyes.
  const me = new Champion({ game, teamId: TeamId.RED });
  me.position.set(0, 0);
  game.setPlayer(me);

  const sasuke = new Champion({ game, teamId: TeamId.BLUE });
  sasuke.position.set(APART, 0);
  const spell = new Sasuke_E(sasuke);
  sasuke.replaceSpells([basicAttackStub(sasuke), spell, spell, spell, spell]);

  indexObjects(game, [me, sasuke]);
  return { me, sasuke };
};

const runFog = () => new FogOfWar(game).calculateSight();

describe('what a Sharingan cast changes on each screen', () => {
  it('is set up so ordinary sight cannot answer for either of them', () => {
    // Without this the test could pass for the wrong reason twice over.
    const { me, sasuke } = scene();
    expect(sasuke.position.dist(me.position)).toBeLessThan(E_REVEAL_RADIUS);
    expect(sasuke.position.dist(me.position)).toBeGreaterThan(sasuke.stats.visionRadius.value);
    runFog();
    expect(sasuke.visibleToPlayerTeam, 'hidden before anybody casts').toBe(false);
  });

  it('lights the champion who was scanned', () => {
    const { me, sasuke } = scene();

    pressSpell(sasuke.spells[SLOT.E]);
    runFog();

    expect(me.visibleToPlayerTeam).toBe(true);
  });

  it('leaves the caster exactly as hidden as he was', () => {
    // The whole report, in one assertion. Three separate paths could have
    // broken this and each is checked in `Sasuke.test.ts`: the granted eye's
    // team, `combat/AttackReveal.ts` firing on a self-cast, and the ability's
    // own art drawing through fog. This is the end-to-end answer that does
    // not care which of them it is.
    const { sasuke } = scene();

    pressSpell(sasuke.spells[SLOT.E]);
    runFog();

    expect(sasuke.visibleToPlayerTeam).toBe(false);
  });
});
