import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, createGame, stubGameGlobals, type TestGame } from '@moba2d/core/testing';
import { pressSpell } from '@moba2d/core/testing/spell';

import Shikamaru_Q, {
  Q_MAX_MS,
  Q_REACH,
  Q_RETRACT_MS,
  Q_UPKEEP,
  Q_UPKEEP_TICK_MS,
  Q_WIDTH,
  Shikamaru_Q_Shadow,
} from '../spells/Shikamaru_Q';
import Shikamaru_W, {
  W_ARM_MS,
  W_DAMAGE,
  W_LIFETIME_MS,
  W_RANGE,
  W_SLOW,
  W_TRIGGER,
  Shikamaru_W_Snare,
} from '../spells/Shikamaru_W';
import Shikamaru_E, {
  E_DAMAGE,
  E_RADIUS,
  E_SILENCE_MS,
  E_TELL_MS,
  Shikamaru_E_Grasp,
} from '../spells/Shikamaru_E';
import Shikamaru_R, {
  R_DAMAGE,
  R_GROW_MS,
  R_REACH,
  Shikamaru_R_Web,
} from '../spells/Shikamaru_R';
import { champion, indexObjects, unit } from './_units';

/**
 * Shikamaru's four, driven the way a key press drives them.
 *
 * The test names are the script each ability was written from. He is the
 * champion the pack had no way to check before: three of his four abilities
 * are worth pressing for something other than damage, and one of them deals
 * none at all — so "did it hurt anybody" is the wrong question for most of
 * this file, and the assertions are about buffs, about who is covered, and
 * about what it costs him.
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

const inWorld = <T>(kind: new (...args: never[]) => T): T[] =>
  [
    ...(game.objectManager.objects as unknown[]),
    ...((game.objectManager as { _objectToBeAdd?: unknown[] })._objectToBeAdd ?? []),
  ].filter(o => o instanceof kind) as T[];

const rooted = (of: ReturnType<typeof unit>): boolean =>
  of.buffs.some(buff => buff instanceof api.buffs.Root);

beforeEach(() => {
  stubGameGlobals();
  vi.stubGlobal('deltaTime', 16);
  game = createGame(2_000);
  game.setPlayer(champion(game, 0, 'player-uuid'));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Kagemane no Jutsu (Q) — he holds them, and it holds him', () => {
  const held = () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);
    const spell = new Shikamaru_Q(caster);
    expect(pressSpell(spell, { caster, at: { x: 400, y: 0 } })).toBe(true);
    const shadow = born(inWorld(Shikamaru_Q_Shadow)[0]);
    return { caster, victim, spell, shadow };
  };

  it('roots whoever is lying under the shadow', () => {
    const { victim, shadow } = held();
    tick([shadow], 16);
    expect(rooted(victim)).toBe(true);
  });

  it('hurts nobody at all', () => {
    // The thesis of the champion, and the one assertion that stops somebody
    // "improving" it later: he wins by deciding where people are.
    const { victim, shadow } = held();
    run([shadow], 1_000);
    expect(victim.stats.health.value).toBe(100);
  });

  it('leaves alone somebody standing beside the strip', () => {
    const caster = champion(game, 0, 'blue');
    const aside = unit(game, 200, 'red', Q_WIDTH);
    indexObjects(game, [caster, aside]);

    pressSpell(new Shikamaru_Q(caster), { caster, at: { x: 400, y: 0 } });
    tick([born(inWorld(Shikamaru_Q_Shadow)[0])], 16);
    expect(rooted(aside)).toBe(false);
  });

  it('leaves alone somebody past the end of it', () => {
    const caster = champion(game, 0, 'blue');
    const far = unit(game, Q_REACH + 120, 'red');
    indexObjects(game, [caster, far]);

    pressSpell(new Shikamaru_Q(caster), { caster, at: { x: 400, y: 0 } });
    tick([born(inWorld(Shikamaru_Q_Shadow)[0])], 16);
    expect(rooted(far)).toBe(false);
  });

  it('never stacks the root, however many frames it holds for', () => {
    // `Root` stacks ten deep by default and this re-applies every frame:
    // without `RENEW_EXISTING` a one-second hold is sixty roots and takes ten
    // times as long to wear off as the ability says.
    const { victim, shadow } = held();
    run([shadow], 600);
    expect(victim.buffs.filter(buff => buff instanceof api.buffs.Root)).toHaveLength(1);
  });

  it('is the only ability in the pack that breaks on its own caster moving', () => {
    // `SpellForm.CHANNELED`. Everything else here survives walking, which is
    // right for them and would make this a lockdown with no price at all.
    expect(Shikamaru_Q.prototype.castSpec.interrupts).toBe(api.enums.SpellForm.CHANNELED);
    expect(api.enums.SpellForm.CHANNELED.move).toBe(true);
  });

  it('bills him chakra for every quarter second it is out', () => {
    const { caster, spell } = held();
    const before = caster.stats.mana.value;
    vi.stubGlobal('deltaTime', Q_UPKEEP_TICK_MS);
    spell.onUpdate();
    expect(before - caster.stats.mana.value).toBe(Q_UPKEEP);
  });

  it('lets go when he presses it again, and the shadow pulls back', () => {
    const { victim, spell, shadow, caster } = held();
    tick([shadow], 16);
    expect(rooted(victim)).toBe(true);

    pressSpell(spell, { caster, at: { x: 400, y: 0 } });
    tick([shadow], 16);
    // Still on screen — it retracts rather than blinking out, and the root
    // it already applied runs down on its own clock.
    expect(shadow.toRemove).toBe(false);
    run([shadow], Q_RETRACT_MS + 32);
    expect(shadow.toRemove).toBe(true);
  });

  it('cannot hold for longer than its own ceiling', () => {
    expect(Shikamaru_Q.prototype.castSpec.active?.maxDurationMs).toBe(Q_MAX_MS);
  });
});

describe('Kage Nui (W) — something on the floor, and then needles', () => {
  const planted = (victimX = 600) => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, victimX, 'red');
    indexObjects(game, [caster, victim]);
    expect(pressSpell(new Shikamaru_W(caster), { caster, at: { x: 250, y: 0 } })).toBe(true);
    const snare = born(inWorld(Shikamaru_W_Snare)[0]);
    indexObjects(game, [caster, victim, snare]);
    return { caster, victim, snare };
  };

  it('is placed where the cursor was, not at the end of the range', () => {
    const { snare } = planted();
    expect(snare.position.x).toBeCloseTo(250, 0);
  });

  it('stops at the edge of its range when the cursor is beyond it', () => {
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);
    pressSpell(new Shikamaru_W(caster), { caster, at: { x: W_RANGE + 400, y: 0 } });
    expect(inWorld(Shikamaru_W_Snare)[0].position.x).toBeCloseTo(W_RANGE, 0);
  });

  it('does nothing to somebody standing on it before it arms', () => {
    // The whole cost of a trap that an enemy cannot see: it is not a nuke
    // with a delay, it has to be placed before the fight arrives.
    const { victim, snare } = planted(250);
    run([snare], W_ARM_MS - 32);
    expect(victim.stats.health.value).toBe(100);
    expect(snare.sprung).toBe(false);
  });

  it('springs on the first body to walk into it', () => {
    const { victim, snare } = planted(250);
    run([snare], W_ARM_MS + 32);
    expect(snare.sprung).toBe(true);
    expect(victim.stats.health.value).toBe(100 - W_DAMAGE);
  });

  it('slows whoever it caught, by half', () => {
    const { victim, snare } = planted(250);
    run([snare], W_ARM_MS + 32);
    const slow = victim.buffs.find(buff => buff instanceof api.buffs.Slow) as
      | InstanceType<typeof api.buffs.Slow>
      | undefined;
    expect(slow, 'nothing slowed them').toBeDefined();
    expect(slow!.percent).toBe(W_SLOW);
  });

  it('is spent by one body, and does not fire twice', () => {
    const { victim, snare } = planted(250);
    run([snare], W_ARM_MS + 32);
    const after = victim.stats.health.value;
    run([snare], 300);
    expect(victim.stats.health.value).toBe(after);
  });

  it('ignores somebody who never came close enough', () => {
    const { victim, snare } = planted(250 + W_TRIGGER + 90);
    run([snare], W_ARM_MS + 200);
    expect(snare.sprung).toBe(false);
    expect(victim.stats.health.value).toBe(100);
  });

  it('goes away on its own if nobody steps in it', () => {
    const { snare } = planted(1_500);
    run([snare], W_LIFETIME_MS + 32);
    expect(snare.toRemove).toBe(true);
  });
});

describe('Kage Kubi Shibari (E) — the hand takes the throat', () => {
  const cast = (victimX = 250) => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, victimX, 'red');
    indexObjects(game, [caster, victim]);
    pressSpell(new Shikamaru_E(caster), { caster, at: { x: 250, y: 0 } });
    const hand = born(inWorld(Shikamaru_E_Grasp)[0]);
    indexObjects(game, [caster, victim, hand]);
    return { caster, victim, hand };
  };

  it('does nothing on the frame it is pressed', () => {
    const { victim } = cast();
    expect(victim.stats.health.value).toBe(100);
  });

  it('closes after the tell', () => {
    const { victim, hand } = cast();
    tick([hand], E_TELL_MS + 1);
    expect(victim.stats.health.value).toBe(100 - E_DAMAGE);
  });

  it('silences whoever it closed on', () => {
    // The only silence in the pack, and the reason he is worth a slot.
    const { victim, hand } = cast();
    tick([hand], E_TELL_MS + 1);
    const hushed = victim.buffs.find(buff => buff instanceof api.buffs.Silence);
    expect(hushed, 'nothing silenced them').toBeDefined();
    expect(hushed!.duration).toBe(E_SILENCE_MS);
  });

  it('lets somebody who walked out of it go', () => {
    const { victim, hand } = cast();
    victim.position.set(250 + E_RADIUS * 2, 0);
    indexObjects(game, [victim, hand]);
    tick([hand], E_TELL_MS + 1);
    expect(victim.stats.health.value).toBe(100);
  });

  it('leaves the hand on screen after it has closed', () => {
    const { hand } = cast();
    tick([hand], E_TELL_MS + 1);
    expect(hand.toRemove, 'vanished on the frame it landed').toBe(false);
  });
});

describe('Kagemane Shūchū (R) — seven ways at once, and he can walk', () => {
  const spread = (victimX = 120) => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, victimX, 'red');
    indexObjects(game, [caster, victim]);
    expect(pressSpell(new Shikamaru_R(caster), { caster })).toBe(true);
    const web = born(inWorld(Shikamaru_R_Web)[0]);
    indexObjects(game, [caster, victim, web]);
    return { caster, victim, web };
  };

  it('catches somebody a tendril reaches, and roots them', () => {
    const { victim, web } = spread();
    run([web], R_GROW_MS + 32);
    expect(victim.stats.health.value).toBe(100 - R_DAMAGE);
    expect(rooted(victim)).toBe(true);
  });

  it('takes each body once, however long it holds', () => {
    const { victim, web } = spread();
    run([web], R_GROW_MS + 32);
    const after = victim.stats.health.value;
    run([web], 800);
    expect(victim.stats.health.value).toBe(after);
  });

  it('sends a strand at whoever is there, rather than hoping', () => {
    // The web *hunts*. The first cut fanned seven strands at even angles with
    // a random offset, and the gap between two of them at mid radius is wider
    // than a body — so whether a 100-chakra ultimate caught the person beside
    // him came down to the seed, and this file failed about one run in five.
    // A body at an awkward angle is the case that proves it.
    const caster = champion(game, 0, 'blue');
    const askew = unit(game, -130, 'red', 130);
    indexObjects(game, [caster, askew]);
    pressSpell(new Shikamaru_R(caster), { caster });
    const web = born(inWorld(Shikamaru_R_Web)[0]);
    indexObjects(game, [caster, askew, web]);

    run([web], R_GROW_MS + 32);
    expect(askew.stats.health.value).toBe(100 - R_DAMAGE);
  });

  it('never reaches past its own rim', () => {
    // The strands wander, which adds arc length — written to the full radius
    // they finish outside the circle the player is reading as the reach.
    const caster = champion(game, 0, 'blue');
    const outside = unit(game, R_REACH + 60, 'red');
    indexObjects(game, [caster, outside]);
    pressSpell(new Shikamaru_R(caster), { caster });
    const web = born(inWorld(Shikamaru_R_Web)[0]);
    indexObjects(game, [caster, outside, web]);

    run([web], R_GROW_MS + 32);
    expect(outside.stats.health.value).toBe(100);
  });

  it('does not put its whole web out on the first frame, but does get there', () => {
    // It crawls. A web that arrived complete would be an undodgeable circle
    // wearing branches, which is the failure Gaara's ultimate was rebuilt for.
    //
    // The second half is what makes the rim test above mean anything: a web
    // that simply never grew would pass "reaches nobody outside 300" for the
    // wrong reason.
    const { victim, web } = spread(R_REACH * 0.62);
    tick([web], 16);
    expect(victim.stats.health.value).toBe(100);

    run([web], R_GROW_MS + 32);
    expect(victim.stats.health.value).toBe(100 - R_DAMAGE);
  });

  it('leaves him free to walk, unlike his Q', () => {
    // The whole argument for the ultimate: not more damage, freedom. Nothing
    // is attached to him and no channel is running, so a step changes nothing.
    const { caster, victim, web } = spread();
    caster.position.set(-400, -400);
    run([web], R_GROW_MS + 32);
    expect(victim.stats.health.value).toBe(100 - R_DAMAGE);
    expect(web.toRemove).toBe(false);
  });
});
