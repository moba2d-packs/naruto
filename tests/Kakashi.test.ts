import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, createGame, stubGameGlobals, type TestGame } from '@moba2d/core/testing';
import { pressSpell } from '@moba2d/core/testing/spell';

import Kakashi_Q, {
  Q_DAMAGE,
  Q_RADIUS,
  Q_STUN_MS,
  Q_TELL_MS,
  Kakashi_Q_Discharge,
} from '../spells/Kakashi_Q';
import Kakashi_W, { W_PHASE_MS } from '../spells/Kakashi_W';
import Kakashi_E, {
  E_BEHIND,
  E_DAMAGE,
  E_RANGE,
  E_ROOT_MS,
  E_SINK_MS,
  Kakashi_E_Burrow,
} from '../spells/Kakashi_E';
import Kakashi_R, {
  R_DAMAGE,
  R_RANGE,
  R_WIDTH,
  R_WINDUP_MS,
  Kakashi_R_Lance,
} from '../spells/Kakashi_R';
import { champion, indexObjects, unit } from './_units';

/**
 * Kakashi's four, driven the way a key press drives them.
 *
 * He is the champion that exists to add the mechanics nobody else had: the
 * pack's only stun, its only invulnerability, its only true damage, and its
 * first cast aimed at an *enemy* body. So most of this file asserts on those
 * facts directly — a regression here is not a tuning change, it is a missing
 * mechanic.
 */
const api = buildTestApi();
let game: TestGame;

const tick = (objects: { update(): void }[], ms: number): void => {
  vi.stubGlobal('deltaTime', ms);
  for (const object of objects) object.update();
};

const run = (objects: { update(): void }[], ms: number, step = 16): void => {
  for (let spent = 0; spent < ms; spent += step) tick(objects, step);
};

/** `ObjectManager.update` is what calls `onAdded` in the world; a test is not. */
const born = <T extends { onAdded?(): void }>(object: T): T => {
  object.onAdded?.();
  return object;
};

/**
 * Runs a spell's own runtime until its wind-up is over.
 *
 * `pressSpell` starts the cast; a spell with a `castTimeMs` lands its payload
 * later, and `Spell.update` is what the game calls in between. Asserting on
 * the frame of the press would be asserting that a windup does not exist.
 */
const settle = (spell: { update(): void }, ms: number, step = 16): void => {
  vi.stubGlobal('deltaTime', step);
  for (let spent = 0; spent <= ms; spent += step) spell.update();
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

describe('Chidori Nagashi (Q) — the only stun in the pack', () => {
  const cast = (victimX = 120) => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, victimX, 'red');
    indexObjects(game, [caster, victim]);
    expect(pressSpell(new Kakashi_Q(caster), { caster })).toBe(true);
    const discharge = born(inWorld(Kakashi_Q_Discharge)[0]);
    indexObjects(game, [caster, victim, discharge]);
    return { caster, victim, discharge };
  };

  it('does nothing on the frame it is pressed', () => {
    const { victim } = cast();
    expect(victim.stats.health.value).toBe(100);
  });

  it('earths itself after the gather and hits everyone around him', () => {
    const { victim, discharge } = cast();
    tick([discharge], Q_TELL_MS + 1);
    expect(victim.stats.health.value).toBe(100 - Q_DAMAGE);
  });

  it('stuns whoever it caught', () => {
    // Six champions could root, slow, disarm, silence, push, pull, throw and
    // knock up. Nobody could take a turn away.
    const { victim, discharge } = cast();
    tick([discharge], Q_TELL_MS + 1);
    const held = victim.buffs.find(buff => buff instanceof api.buffs.Stun);
    expect(held, 'nothing stunned them').toBeDefined();
    expect(held!.duration).toBe(Q_STUN_MS);
  });

  it('leaves the stun wearing its own swirl, not the ability icon', () => {
    // The one buff the house convention says *not* to relabel: `Stun.draw()`
    // paints its icon into the world at body size, and that swirl is how the
    // whole screen answers "who is stunned right now".
    const { victim, discharge } = cast();
    tick([discharge], Q_TELL_MS + 1);
    const held = victim.buffs.find(buff => buff instanceof api.buffs.Stun);
    expect(held!.image).not.toBe(Kakashi_Q.prototype.image);
  });

  it('leaves alone somebody outside the ring', () => {
    const { victim, discharge } = cast(Q_RADIUS + 120);
    tick([discharge], Q_TELL_MS + 1);
    expect(victim.stats.health.value).toBe(100);
  });

  it('leaves the arcs on screen after the damage has landed', () => {
    const { discharge } = cast();
    tick([discharge], Q_TELL_MS + 1);
    expect(discharge.toRemove, 'vanished on the frame it hit').toBe(false);
  });
});

describe('Kamui (W) — the first thing here you dodge with', () => {
  const phased = () => {
    const caster = champion(game, 0, 'blue');
    const enemy = unit(game, 200, 'red');
    indexObjects(game, [caster, enemy]);
    expect(pressSpell(new Kakashi_W(caster), { caster })).toBe(true);
    return { caster, enemy };
  };

  it('takes him out of the world', () => {
    const { caster } = phased();
    expect(caster.buffs.some(buff => buff instanceof api.buffs.Untargetable)).toBe(true);
    expect(caster.buffs.some(buff => buff instanceof api.buffs.Invulnerable)).toBe(true);
  });

  it('makes him take nothing at all while it holds', () => {
    // The half `Untargetable` alone does not cover: an area effect chooses
    // nobody, so without `Invulnerable` he would still burn in a fire he is
    // standing in.
    const { caster, enemy } = phased();
    caster.takeDamage(40, enemy, 'MAGIC');
    expect(caster.stats.health.value).toBe(100);
  });

  it('leaves his feet alone — it is a dodge, not a Stasis', () => {
    // `Stasis` is the whole Zhonya's package and freezes the unit. Frozen is
    // wrong here: a dodge that plants him is a worse escape than walking.
    const { caster } = phased();
    expect(caster.buffs.some(buff => buff instanceof api.buffs.Stasis)).toBe(false);
    expect(caster.canMove).toBe(true);
  });

  it('gives it back after three quarters of a second', () => {
    const { caster } = phased();
    const hidden = caster.buffs.find(buff => buff instanceof api.buffs.Untargetable);
    expect(hidden!.duration).toBe(W_PHASE_MS);
  });

  it('hurts nobody', () => {
    const { enemy } = phased();
    expect(enemy.stats.health.value).toBe(100);
  });
});

describe('Shinjū Zanshu (E) — he comes up behind you', () => {
  const buried = (victimX = 150) => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, victimX, 'red');
    indexObjects(game, [caster, victim]);
    return { caster, victim, spell: new Kakashi_E(caster) };
  };

  it('refuses to be pointed at an ally', () => {
    // `targetTeam: 'ENEMY'`. Left off, targeting defaults to `'ANY'` and the
    // nearest-target fallback resolves *him* — an ability that teleports him
    // behind himself and roots him. Four abilities in the largest pack
    // shipped exactly that way.
    const caster = champion(game, 0, 'blue');
    const friend = unit(game, 150, 'blue');
    indexObjects(game, [caster, friend]);
    expect(pressSpell(new Kakashi_E(caster), { caster, target: friend })).toBe(false);
    expect(friend.stats.health.value).toBe(100);
  });

  it('refuses to be pointed at himself', () => {
    const { caster, spell } = buried();
    expect(pressSpell(spell, { caster, target: caster })).toBe(false);
  });

  it('is still standing where he was while he sinks', () => {
    // The quarter second is real: he is not behind them on the frame of the
    // press, and an enemy has that long to walk out of reach.
    const { caster, victim, spell } = buried(150);
    expect(pressSpell(spell, { caster, target: victim })).toBe(true);
    expect(caster.position.x).toBeCloseTo(0, 0);
    expect(victim.stats.health.value).toBe(100);
  });

  it('comes up on the far side of the target', () => {
    // The difference between a gap-closer and a reposition: the rooted body
    // ends up between him and wherever they were walking.
    const { caster, victim, spell } = buried(150);
    pressSpell(spell, { caster, target: victim });
    settle(spell, E_SINK_MS + 32);
    expect(caster.position.x).toBeCloseTo(150 + E_BEHIND, 0);
  });

  it('hurts them and buries them to the neck', () => {
    const { caster, victim, spell } = buried();
    pressSpell(spell, { caster, target: victim });
    settle(spell, E_SINK_MS + 32);
    expect(victim.stats.health.value).toBe(100 - E_DAMAGE);
    const root = victim.buffs.find(buff => buff instanceof api.buffs.Root);
    expect(root, 'nothing rooted them').toBeDefined();
    expect(root!.duration).toBe(E_ROOT_MS);
  });

  it('refuses somebody out of reach', () => {
    const { caster, victim, spell } = buried(E_RANGE + 200);
    expect(pressSpell(spell, { caster, target: victim })).toBe(false);
    expect(victim.stats.health.value).toBe(100);
  });

  it('leaves both holes on screen, and closes them together', () => {
    const { caster, victim, spell } = buried();
    pressSpell(spell, { caster, target: victim });
    settle(spell, E_SINK_MS + 32);
    const burrow = born(inWorld(Kakashi_E_Burrow)[0]);
    expect(burrow, 'no hole was left').toBeDefined();
    expect(burrow.from.x).toBeCloseTo(0, 0);
    tick([burrow], 16);
    expect(burrow.toRemove).toBe(false);
  });
});

describe('Raikiri (R) — true damage, and nearly a second of standing still', () => {
  const charged = (victimX = 200) => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, victimX, 'red');
    indexObjects(game, [caster, victim]);
    expect(pressSpell(new Kakashi_R(caster), { caster, at: { x: 600, y: 0 } })).toBe(true);
    const lance = born(inWorld(Kakashi_R_Lance)[0]);
    indexObjects(game, [caster, victim, lance]);
    return { caster, victim, lance };
  };

  it('roots him the moment it is pressed, in plain sight', () => {
    // Half the ability. Take the wind-up off and it is a point-and-click
    // execute; the counterplay is that everybody can see it coming.
    const { caster } = charged();
    const planted = caster.buffs.find(buff => buff instanceof api.buffs.Root);
    expect(planted, 'he was free to walk').toBeDefined();
    expect(planted!.duration).toBe(R_WINDUP_MS);
  });

  it('does nothing at all until the second is up', () => {
    const { victim, lance } = charged();
    run([lance], R_WINDUP_MS - 32);
    expect(victim.stats.health.value).toBe(100);
    expect(lance.spent).toBe(false);
  });

  it('lands as true damage, which nothing in the pack else does', () => {
    // `combat/Mitigation.ts` takes nothing off it, which is what the wind-up
    // is paying for. Pinned against real resistances, or the assertion would
    // pass for a magic hit on a unit with none.
    const { victim, lance } = charged();
    victim.stats.armor.baseValue = 80;
    victim.stats.magicResist.baseValue = 80;
    run([lance], R_WINDUP_MS + 32);
    expect(victim.stats.health.value).toBe(100 - R_DAMAGE);
  });

  it('takes the first body in the line and no others', () => {
    const caster = champion(game, 0, 'blue');
    const front = unit(game, 150, 'red');
    const back = unit(game, 320, 'red');
    indexObjects(game, [caster, front, back]);
    pressSpell(new Kakashi_R(caster), { caster, at: { x: 600, y: 0 } });
    const lance = born(inWorld(Kakashi_R_Lance)[0]);
    indexObjects(game, [caster, front, back, lance]);

    run([lance], R_WINDUP_MS + 32);
    expect(front.stats.health.value).toBe(100 - R_DAMAGE);
    expect(back.stats.health.value).toBe(100);
  });

  it('is wasted on an empty line', () => {
    const { victim, lance } = charged(200);
    victim.position.set(200, R_WIDTH * 2);
    indexObjects(game, [victim, lance]);
    run([lance], R_WINDUP_MS + 32);
    expect(victim.stats.health.value).toBe(100);
    expect(lance.spent).toBe(true);
  });

  it('leaves nobody standing past its range', () => {
    const { victim, lance } = charged(R_RANGE + 150);
    run([lance], R_WINDUP_MS + 32);
    expect(victim.stats.health.value).toBe(100);
  });

  it('carries him across the gap onto the body it went through', () => {
    const { caster, victim, lance } = charged(300);
    run([lance], R_WINDUP_MS + 32);
    expect(caster.position.x).toBeGreaterThan(200);
    expect(victim.stats.health.value).toBe(100 - R_DAMAGE);
  });

  it('leaves the line on screen after the strike', () => {
    const { lance } = charged();
    run([lance], R_WINDUP_MS + 32);
    expect(lance.toRemove, 'vanished on the frame it landed').toBe(false);
  });
});
