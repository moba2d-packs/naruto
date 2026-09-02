/**
 * What these abilities let the team see.
 *
 * Core already does all of the work and it is easy to miss: `FogOfWar`'s
 * `fogRevealOf` reads `visionRadius` off **any** object, not only units, and
 * casts the same wall-aware polygon it casts for a champion. So a spell
 * object grants sight by carrying one number — no ward, no buff, no timer —
 * and the effect's own lifetime is the window.
 *
 * That "no timer" is the part worth pinning. Nothing in these files says how
 * long the sight lasts, because nothing needs to: a bolt that fades in half a
 * second shows half a second, and a fire that burns for three shows three.
 * The day somebody gives one of them a longer fade, the sight follows, which
 * is right — and the day somebody copies `visionRadius` onto a missile that
 * crosses the whole map, this file is where it goes red.
 *
 * `GameObject` starts every object at `visionRadius = 0`, which is exactly
 * what `fogRevealOf` reads as "lights nothing" — so the abilities that grant
 * no sight are asserted against 0 rather than against absence. There is no
 * such thing as an object without the field.
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
import { champion } from './_units';
import { SIGHT, RANGE_BAND } from '../spellVfx';
import { Naruto_Q_Vortex } from '../spells/Naruto_Q_Vortex';
import { Naruto_Q2_Scorch } from '../spells/Naruto_Q2_Scorch';
import { Naruto_E2_Detonation } from '../spells/Naruto_E2_Detonation';
import { Sasuke_Q_Bolt } from '../spells/Sasuke_Q_Bolt';
import { Sasuke_W_Blaze } from '../spells/Sasuke_W_Blaze';
import { AmaterasuFlame } from '../spells/Sasuke_W2';
import { Naruto_W_Smoke } from '../spells/Naruto_W_Smoke';
import { KuramaAura } from '../spells/Naruto_R_Aura';
import { SageAura } from '../spells/Naruto_E_Aura';
import { Gaara_Q_Column } from '../spells/Gaara_Q';
import { Gaara_Q_Sand } from '../spells/Gaara_Q_Sand';
import { Gaara_R_Grip } from '../spells/Gaara_R_Grip';
import { Gaara_W_Shell } from '../spells/Gaara_W';
import { Gaara_E_Wave } from '../spells/Gaara_E';

let game: TestGame;

beforeEach(() => {
  stubGameGlobals();
  game = createGame(2_000);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * `visionRadius` is a class field, so it exists on an instance and not on the
 * prototype — the number has to be read off a real object.
 */
const sightOf = (cls: new (owner: never) => { visionRadius?: number }): number | undefined =>
  new cls(champion(game, 0, 'blue') as never).visionRadius;

/** What `FogOfWar.fogRevealOf` treats as "this lights nothing". */
const DARK = 0;

/** Where an effect landed is where it lights. */
const LIGHTS = [
  ['Rasengan burst', Naruto_Q_Vortex, SIGHT.IMPACT],
  ['Bijuu Rasengan scorch', Naruto_Q2_Scorch, SIGHT.IMPACT],
  ['Bijuudama detonation', Naruto_E2_Detonation, SIGHT.BLAST],
  ['Chidori arrival', Sasuke_Q_Bolt, SIGHT.IMPACT],
  ['Gōkakyū blaze', Sasuke_W_Blaze, SIGHT.ZONE],
  ['Amaterasu flame', AmaterasuFlame, SIGHT.MARK],
  ['Suna Shigure lights where the column landed', Gaara_Q_Column, SIGHT.IMPACT],
  ['the sand patch holds the ground it is lying on', Gaara_Q_Sand, SIGHT.ZONE],
  ['Sabaku Sōsō marks the body it took', Gaara_R_Grip, SIGHT.MARK],
] as const;

describe('a landed effect lights the ground it landed on', () => {
  it.each(LIGHTS)('%s', (_name, cls, expected) => {
    expect(sightOf(cls as never)).toBe(expected);
  });

  it('never lights further than the ability could reach', () => {
    // Vision is the strongest thing an ability can quietly hand out: a spell
    // that lights more ground than it can touch is a scouting tool whatever
    // its damage says. Written against the pack's own range band rather than
    // a number, so retuning reach cannot silently outgrow this.
    for (const [name, , radius] of LIGHTS) {
      expect(radius, name).toBeLessThan(RANGE_BAND.ABILITY);
    }
  });
});

describe('what deliberately lights nothing', () => {
  it('leaves the decoy smoke dark', () => {
    // Kage Bunshin's puff happens where Naruto already is, and again wherever
    // a clone dies. Sight there is either free or a reward for losing a
    // clone; neither is a thing the ability is selling.
    expect(sightOf(Naruto_W_Smoke as never)).toBe(DARK);
  });

  it('leaves the two auras dark, because they are worn, not landed', () => {
    // A cloak and a sage's eyes ride the champion, whose own sight already
    // covers exactly that ground. A second radius there would be a champion
    // who sees further for being transformed, which is not what either
    // ability says it does.
    expect(sightOf(KuramaAura as never)).toBe(DARK);
    expect(sightOf(SageAura as never)).toBe(DARK);
  });

  it('leaves the sand shield dark, for the same reason', () => {
    // Suna no Tate is worn too. It bursts where he is standing, and he can
    // already see there.
    expect(sightOf(Gaara_W_Shell as never)).toBe(DARK);
  });

  it('leaves the wave dark, which is the whole bargain of player-made terrain', () => {
    // A ridge that granted sight would be a ward with a cooldown — and a
    // *travelling* one, which is worse: a moving eye that sweeps a lane. It blocks feet and
    // not eyes on purpose (see the class header), and lighting the fog would
    // give back with one hand exactly what that decision took with the other.
    expect(sightOf(Gaara_E_Wave as never)).toBe(DARK);
  });
});

describe('the fog actually reads it', () => {
  /**
   * The number being right proves nothing about whether anything looks at it.
   * This drives core's own `FogOfWar.calculateSight` and asks the question the
   * player asks: did the enemy in the dark light up?
   *
   * `calculateSightForObject` is stubbed the way the reference pack stubs it —
   * the raycast is a separate concern and needs real terrain — so a pass here
   * means one thing only: the burst survived the revealer filter, which is the
   * step that silently drops an object whose reveal radius is 0.
   */
  const revealsThroughFog = (make: (owner: never) => object): boolean => {
    const Champion = buildTestApi().units.Champion;
    const player = new Champion({ game, teamId: TeamId.BLUE });
    player.position.set(100, 100);
    game.setPlayer(player);

    const effect = make(player as never) as { position: { set: (x: number, y: number) => void } };
    effect.position.set(3_000, 3_000);

    const enemy = new Champion({ game, teamId: TeamId.RED });
    enemy.position.set(3_010, 3_000);

    const fog = Object.create(FogOfWar.prototype) as FogOfWar;
    (fog as unknown as { game: unknown }).game = game;
    (
      fog as unknown as { calculateSightForObject: (o: unknown) => unknown }
    ).calculateSightForObject = (o: unknown) => ({
      sightPoly: [],
      playersInSight: o === effect ? [enemy] : [],
    });

    indexObjects(game, [player, effect as never, enemy]);
    fog.calculateSight();
    return enemy.visibleToPlayerTeam;
  };

  it('lights an enemy standing where the Rasengan burst', () => {
    expect(revealsThroughFog(owner => new Naruto_Q_Vortex(owner))).toBe(true);
  });

  it('lights an enemy standing in the blaze', () => {
    expect(revealsThroughFog(owner => new Sasuke_W_Blaze(owner))).toBe(true);
  });

  it('does not light one standing in the decoy smoke', () => {
    // The other direction, through the same machinery: an object at 0 is
    // dropped by the revealer filter and lights nothing, which is what makes
    // the two tests above mean something.
    expect(revealsThroughFog(owner => new Naruto_W_Smoke(owner))).toBe(false);
  });
});
