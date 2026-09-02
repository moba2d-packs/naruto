import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, createGame, stubGameGlobals, type TestGame } from '@moba2d/core/testing';
import { pressSpell } from '@moba2d/core/testing/spell';

import Sakura_Q, {
  Q_DAMAGE,
  Q_HALF_ANGLE,
  Q_LENGTH,
  Q_SETTLE_MS,
  Q_SHOVE,
  Q_TELL_MS,
  Sakura_Q_Fissure,
} from '../spells/Sakura_Q';
import Sakura_W, {
  W_CRITICAL_HEAL,
  W_HEAL,
  W_MEND_MS,
  W_MEND_TICK,
  W_MEND_TICKS,
  W_MEND_TICK_MS,
  W_REACH_MS,
  Sakura_W_Mend,
} from '../spells/Sakura_W';
import Sakura_E, {
  E_BLEED_MS,
  E_BLEED_TICK,
  E_BLEED_TICKS,
  E_DAMAGE,
  E_HEAL_CUT,
  E_REACH,
  E_SWEEP_MS,
  E_WINDUP_MS,
  Sakura_E_Scalpel,
} from '../spells/Sakura_E';
import Sakura_R, {
  R_LEAP_HEIGHT,
  R_LEAP_SPEED,
  R_RANGE,
  Sakura_R_Leap,
} from '../spells/Sakura_R';
import {
  CRATER_DAMAGE,
  CRATER_RADIUS,
  CRATER_RUBBLE_MS,
  CRATER_SLOW,
  Sakura_R_Crater,
} from '../spells/Sakura_R_Crater';
import { champion, indexObjects, unit } from './_units';

/**
 * Sakura's four, driven the way a key press drives them.
 *
 * The test names are the script each ability was written from — see each
 * spell's own header. `docs/ADDING_SPELLS.md` asks for the player-visible
 * sequence *before* the code, and the cheapest way to keep that honest is to
 * make the sequence the thing that is asserted.
 *
 * Everything goes through `pressSpell`, never a lifecycle hook. It matters
 * most for `Sakura_W`: it is this pack's first `UNIT` spell, its whole job is
 * resolving a target, and a hook called directly would skip `TargetResolver`
 * entirely — which is the half that decides an ally from an enemy.
 */
const api = buildTestApi();
let game: TestGame;

const tick = (objects: { update(): void }[], ms: number): void => {
  vi.stubGlobal('deltaTime', ms);
  for (const object of objects) object.update();
};

/** Drives a list in real frames, so a per-tick effect cannot be skipped. */
const run = (objects: { update(): void }[], ms: number, step = 16): void => {
  for (let spent = 0; spent < ms; spent += step) tick(objects, step);
};

/**
 * The world calls `onAdded` when `ObjectManager.update` flushes its pending
 * list; a test that drives an object's own `update()` never gets there. So
 * anything whose `onAdded` does real work — the leap's height modifier, every
 * particle system's ownership hand-off — has to be born first, or the test is
 * driving a half-constructed object and quietly measuring the wrong thing.
 */
const born = <T extends { onAdded?(): void }>(object: T): T => {
  object.onAdded?.();
  return object;
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

describe('Shannarō (Q) — the floor cracks, then it breaks', () => {
  it('hurts nobody on the frame it is pressed', () => {
    // The tell is the whole counterplay. If the slabs landed instantly this
    // would be a point-blank nuke with a decorative crack in front of it.
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 120, 'red');
    indexObjects(game, [caster, victim]);

    expect(pressSpell(new Sakura_Q(caster), { caster, at: { x: 300, y: 0 } })).toBe(true);
    expect(victim.stats.health.value).toBe(100);
  });

  it('breaks after the tell and hits whoever is still standing there', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 120, 'red');
    indexObjects(game, [caster, victim]);

    pressSpell(new Sakura_Q(caster), { caster, at: { x: 300, y: 0 } });
    tick(inWorld(Sakura_Q_Fissure), Q_TELL_MS + 1);
    expect(victim.stats.health.value).toBe(100 - Q_DAMAGE);
  });

  it('leaves alone somebody standing behind her', () => {
    // The wedge is the hitbox and the drawing both. A body outside the arc is
    // outside the ability, however close it is.
    const caster = champion(game, 0, 'blue');
    const behind = unit(game, -120, 'red');
    indexObjects(game, [caster, behind]);

    pressSpell(new Sakura_Q(caster), { caster, at: { x: 300, y: 0 } });
    tick(inWorld(Sakura_Q_Fissure), Q_TELL_MS + 1);
    expect(behind.stats.health.value).toBe(100);
  });

  it('leaves alone somebody just outside the edge of the wedge', () => {
    const caster = champion(game, 0, 'blue');
    // Same distance, a hair wider than the half angle.
    const wide = unit(
      game,
      Math.cos(Q_HALF_ANGLE + 0.25) * 120,
      'red',
      Math.sin(Q_HALF_ANGLE + 0.25) * 120
    );
    indexObjects(game, [caster, wide]);

    pressSpell(new Sakura_Q(caster), { caster, at: { x: 300, y: 0 } });
    tick(inWorld(Sakura_Q_Fissure), Q_TELL_MS + 1);
    expect(wide.stats.health.value).toBe(100);
  });

  it('leaves alone somebody past the reach', () => {
    const caster = champion(game, 0, 'blue');
    const far = unit(game, Q_LENGTH + 120, 'red');
    indexObjects(game, [caster, far]);

    pressSpell(new Sakura_Q(caster), { caster, at: { x: 300, y: 0 } });
    tick(inWorld(Sakura_Q_Fissure), Q_TELL_MS + 1);
    expect(far.stats.health.value).toBe(100);
  });

  it('throws a caught body directly away from her', () => {
    // The shove is what the ability is for. Away from *her*, not along the
    // wedge's centre line: the punch is what moved them, and art that swept
    // one way over a push that went another reads as a bug.
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 100, 'red', 40);
    indexObjects(game, [caster, victim]);

    pressSpell(new Sakura_Q(caster), { caster, at: { x: 300, y: 0 } });
    tick(inWorld(Sakura_Q_Fissure), Q_TELL_MS + 1);

    const thrown = victim.buffs.find(buff => buff instanceof api.buffs.Dash) as
      | InstanceType<typeof api.buffs.Dash>
      | undefined;
    expect(thrown, 'nothing threw them').toBeDefined();
    const to = thrown!.dashDestination!;
    const gap = Math.hypot(to.x - caster.position.x, to.y - caster.position.y);
    expect(gap).toBeGreaterThan(Math.hypot(100, 40));
    expect(gap).toBeCloseTo(Math.hypot(100, 40) + Q_SHOVE, 0);
  });

  it('leaves the broken floor on screen after the damage has landed', () => {
    // The third phase, and the one that gets skipped. An effect deleted on
    // the frame it fires teaches nothing — the damage number is then the only
    // evidence it happened.
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    pressSpell(new Sakura_Q(caster), { caster, at: { x: 300, y: 0 } });
    const [fissure] = inWorld(Sakura_Q_Fissure);
    tick([fissure], Q_TELL_MS + 1);
    expect(fissure.toRemove, 'vanished on the frame it hit').toBe(false);

    tick([fissure], Q_SETTLE_MS);
    expect(fissure.toRemove).toBe(true);
  });
});

describe('Shōsen Jutsu (W) — a hand out, and somebody mended', () => {
  const hurt = (of: ReturnType<typeof unit>, to: number) => {
    of.stats.health.baseValue = to;
    return of;
  };

  it('refuses to be pointed at an enemy', () => {
    // `targetTeam: 'ALLY'`. Left off, targeting defaults to `'ANY'` and the
    // heal lands on whoever the cursor is over — including the person she is
    // fighting.
    const caster = champion(game, 0, 'blue');
    const enemy = hurt(unit(game, 200, 'red'), 40);
    indexObjects(game, [caster, enemy]);

    expect(pressSpell(new Sakura_W(caster), { caster, target: enemy })).toBe(false);
    expect(enemy.stats.health.value).toBe(40);
  });

  it('heals nobody on the frame it is pressed — the cord has to get there', () => {
    const caster = champion(game, 0, 'blue');
    const ally = hurt(unit(game, 200, 'blue'), 40);
    indexObjects(game, [caster, ally]);

    expect(pressSpell(new Sakura_W(caster), { caster, target: ally })).toBe(true);
    expect(ally.stats.health.value).toBe(40);
  });

  it('heals the ally when the cord arrives', () => {
    const caster = champion(game, 0, 'blue');
    // Above half health, so this is the ordinary number and not the bonus —
    // and far enough below the cap that `maxHealth` is not what is measured.
    const ally = hurt(unit(game, 200, 'blue'), 70);
    indexObjects(game, [caster, ally]);

    pressSpell(new Sakura_W(caster), { caster, target: ally });
    tick(inWorld(Sakura_W_Mend), W_REACH_MS + 1);
    expect(ally.stats.health.value).toBe(70 + W_HEAL);
  });

  it('pays more when the ally is under half health', () => {
    // The decision the ability exists to ask: spend it on chip damage, or
    // hold it for the moment somebody is about to die.
    const caster = champion(game, 0, 'blue');
    const ally = hurt(unit(game, 200, 'blue'), 30);
    indexObjects(game, [caster, ally]);

    pressSpell(new Sakura_W(caster), { caster, target: ally });
    tick(inWorld(Sakura_W_Mend), W_REACH_MS + 1);
    expect(ally.stats.health.value).toBe(30 + W_CRITICAL_HEAL);
  });

  it('keeps mending every half second afterwards', () => {
    const caster = champion(game, 0, 'blue');
    const ally = hurt(unit(game, 200, 'blue'), 20);
    indexObjects(game, [caster, ally]);

    pressSpell(new Sakura_W(caster), { caster, target: ally });
    const [mend] = inWorld(Sakura_W_Mend);
    tick([mend], W_REACH_MS + 1);
    const afterTouch = ally.stats.health.value;

    run([mend], W_MEND_MS);
    expect(ally.stats.health.value - afterTouch).toBe(W_MEND_TICK * W_MEND_TICKS);
  });

  it('lands exactly the number of mends the tooltip quotes', () => {
    // `ceil - 1`, not `floor`: the loop runs only while the effect is still
    // alive, so a tick falling on the last millisecond never fires. This pack
    // has had that off by one twice.
    expect(W_MEND_TICKS).toBe(Math.ceil(W_MEND_MS / W_MEND_TICK_MS) - 1);
  });

  it('can be pointed at herself', () => {
    // She is melee, has no escape, and `'ALLY'` includes the caster. A heal
    // she cannot spend on herself is a heal she cannot spend while alone.
    const caster = champion(game, 0, 'blue');
    caster.stats.health.baseValue = 50;
    indexObjects(game, [caster]);

    expect(pressSpell(new Sakura_W(caster), { caster, target: caster })).toBe(true);
    tick(inWorld(Sakura_W_Mend), W_REACH_MS + 1);
    expect(caster.stats.health.value).toBeGreaterThan(50);
  });

  it('leaves the mark on the ally after the last mend', () => {
    const caster = champion(game, 0, 'blue');
    const ally = hurt(unit(game, 200, 'blue'), 20);
    indexObjects(game, [caster, ally]);

    pressSpell(new Sakura_W(caster), { caster, target: ally });
    const [mend] = inWorld(Sakura_W_Mend);
    run([mend], W_REACH_MS + W_MEND_MS + 16);
    expect(mend.toRemove, 'blinked out on the last tick').toBe(false);
  });
});

describe('Chakra no Mesu (E) — one line, and it opens somebody up', () => {
  const cutOpen = (casterX = 0) => {
    const caster = champion(game, casterX, 'blue');
    const victim = unit(game, casterX + 120, 'red');
    indexObjects(game, [caster, victim]);
    pressSpell(new Sakura_E(caster), { caster, at: { x: casterX + 300, y: 0 } });
    const [blade] = inWorld(Sakura_E_Scalpel);
    run([blade], E_WINDUP_MS + E_SWEEP_MS + 16);
    return { caster, victim, blade };
  };

  it('cuts nothing while the blade is still forming', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 120, 'red');
    indexObjects(game, [caster, victim]);

    pressSpell(new Sakura_E(caster), { caster, at: { x: 300, y: 0 } });
    const [blade] = inWorld(Sakura_E_Scalpel);
    run([blade], E_WINDUP_MS - 16);
    expect(victim.stats.health.value).toBe(100);
  });

  it('cuts whoever the blade passes over', () => {
    const { victim } = cutOpen();
    expect(victim.stats.health.value).toBeLessThanOrEqual(100 - E_DAMAGE);
  });

  it('cuts each body exactly once, however slow the frame was', () => {
    // Multi-hit protection. A sweep that ran on one huge frame and one that
    // ran on thirty small ones have to deal the same damage.
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 120, 'red');
    indexObjects(game, [caster, victim]);

    pressSpell(new Sakura_E(caster), { caster, at: { x: 300, y: 0 } });
    const [blade] = inWorld(Sakura_E_Scalpel);
    run([blade], E_WINDUP_MS + E_SWEEP_MS + 16, 4);
    // The bleed has not had time to tick, so the whole loss is the cut.
    expect(victim.stats.health.value).toBe(100 - E_DAMAGE);
  });

  it('leaves alone somebody standing behind her', () => {
    const caster = champion(game, 0, 'blue');
    const behind = unit(game, -120, 'red');
    indexObjects(game, [caster, behind]);

    pressSpell(new Sakura_E(caster), { caster, at: { x: 300, y: 0 } });
    run(inWorld(Sakura_E_Scalpel), E_WINDUP_MS + E_SWEEP_MS + 16);
    expect(behind.stats.health.value).toBe(100);
  });

  it('leaves alone somebody past the reach', () => {
    const caster = champion(game, 0, 'blue');
    const far = unit(game, E_REACH + 140, 'red');
    indexObjects(game, [caster, far]);

    pressSpell(new Sakura_E(caster), { caster, at: { x: 600, y: 0 } });
    run(inWorld(Sakura_E_Scalpel), E_WINDUP_MS + E_SWEEP_MS + 16);
    expect(far.stats.health.value).toBe(100);
  });

  it('takes the weapon out of their hands', () => {
    // The only disarm in the pack, and the reason this is on an eight-second
    // cooldown rather than a four-second one.
    const { victim } = cutOpen();
    expect(victim.buffs.some(buff => buff instanceof api.buffs.Disarm)).toBe(true);
  });

  it('makes every heal they get worth less', () => {
    const { victim } = cutOpen();
    const wound = victim.buffs.find(buff => buff instanceof api.buffs.HealCut) as
      | InstanceType<typeof api.buffs.HealCut>
      | undefined;
    expect(wound, 'nothing wounded them').toBeDefined();
    expect(wound!.healCut).toBe(E_HEAL_CUT);
  });

  it('bleeds them for as many ticks as the tooltip quotes', () => {
    // Pinned against the buff being *driven* rather than against the
    // arithmetic: `DamageOverTime` ticks on an accumulator and the buff's own
    // expiry decides whether the last one fires, and those two have
    // disagreed in this pack before.
    const { victim } = cutOpen();
    const before = victim.stats.health.value;
    for (let spent = 0; spent < E_BLEED_MS + 32; spent += 16) {
      vi.stubGlobal('deltaTime', 16);
      for (const buff of [...victim.buffs]) buff.update();
    }
    expect(before - victim.stats.health.value).toBe(E_BLEED_TICK * E_BLEED_TICKS);
  });

  it('leaves the cut on screen after the blade has passed', () => {
    const { blade } = cutOpen();
    expect(blade.toRemove, 'vanished on the frame it cut').toBe(false);
  });
});

describe('Ōkashō (R) — she jumps, and the floor loses', () => {
  const leapOf = (caster: ReturnType<typeof champion>) =>
    caster.buffs.find(buff => buff instanceof api.buffs.Dash) as
      | InstanceType<typeof api.buffs.Dash>
      | undefined;

  it('does nothing at all while she is still in the air', () => {
    // Gaara's ultimate was rebuilt for exactly this — "instant quá, địch ko
    // né đc". Half a second and a ring on the ground is the middle this one
    // has instead.
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 300, 'red');
    indexObjects(game, [caster, victim]);

    expect(pressSpell(new Sakura_R(caster), { caster, at: { x: 300, y: 0 } })).toBe(true);
    run(inWorld(Sakura_R_Leap), 300);
    expect(victim.stats.health.value).toBe(100);
    expect(inWorld(Sakura_R_Crater)).toHaveLength(0);
  });

  it('carries her toward the point she nominated', () => {
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    pressSpell(new Sakura_R(caster), { caster, at: { x: 300, y: 0 } });
    const jump = leapOf(caster);
    expect(jump, 'she never left the ground').toBeDefined();
    // Where the cursor was, not the end of the range. `getVectorWithRange`
    // would put this at 430 and throw her clean over whoever she pressed on.
    expect(jump!.dashDestination!.x).toBeCloseTo(300, 0);
    expect(jump!.dashSpeed).toBe(R_LEAP_SPEED);
  });

  it('still stops at the edge of its range when the cursor is beyond it', () => {
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    pressSpell(new Sakura_R(caster), { caster, at: { x: R_RANGE + 500, y: 0 } });
    expect(leapOf(caster)!.dashDestination!.x).toBeCloseTo(R_RANGE, 0);
  });

  it('draws her bigger while she is airborne and puts her back on landing', () => {
    // How this engine says "in the air" in a top-down view — the same
    // `stats.height` `Airborne` uses. It is also the thing that has to come
    // back off however the leap ends.
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    const before = caster.stats.height.value;
    pressSpell(new Sakura_R(caster), { caster, at: { x: 300, y: 0 } });
    const leap = born(inWorld(Sakura_R_Leap)[0]);
    tick([leap], 16);
    expect(caster.stats.height.value).toBe(before + R_LEAP_HEIGHT);

    leapOf(caster)!.deactivateBuff();
    tick([leap], 16);
    expect(caster.stats.height.value).toBe(before);
  });

  it('craters when she lands, hitting everything inside the radius', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 90, 'red');
    indexObjects(game, [caster, victim]);

    pressSpell(new Sakura_R(caster), { caster, at: { x: 300, y: 0 } });
    const [leap] = inWorld(Sakura_R_Leap);
    leapOf(caster)!.deactivateBuff();
    tick([leap], 16);

    const [crater] = inWorld(Sakura_R_Crater);
    expect(crater, 'she landed and nothing happened').toBeDefined();
    indexObjects(game, [caster, victim, crater]);
    tick([crater], 16);
    expect(victim.stats.health.value).toBe(100 - CRATER_DAMAGE);
  });

  it('leaves alone somebody outside the crater', () => {
    const caster = champion(game, 0, 'blue');
    const far = unit(game, CRATER_RADIUS + 120, 'red');
    indexObjects(game, [caster, far]);

    pressSpell(new Sakura_R(caster), { caster, at: { x: 0, y: 0 } });
    const [leap] = inWorld(Sakura_R_Leap);
    leapOf(caster)!.deactivateBuff();
    tick([leap], 16);
    const [crater] = inWorld(Sakura_R_Crater);
    indexObjects(game, [caster, far, crater]);
    tick([crater], 16);
    expect(far.stats.health.value).toBe(100);
  });

  it('slows whoever stays standing in the rubble', () => {
    const { victim, crater } = crateredOn();
    tick([crater], 16);
    const slow = victim.buffs.find(buff => buff instanceof api.buffs.Slow) as
      | InstanceType<typeof api.buffs.Slow>
      | undefined;
    expect(slow, 'the rubble slowed nobody').toBeDefined();
    expect(slow!.percent).toBe(CRATER_SLOW);
  });

  it('never stacks that slow into a standstill', () => {
    // `Slow` stacks ten deep by default, so a zone re-applying every frame
    // turns 35% into "cannot move". One instance, its clock rewound.
    const { victim, crater } = crateredOn();
    run([crater], 600);
    const slows = victim.buffs.filter(buff => buff instanceof api.buffs.Slow);
    expect(slows).toHaveLength(1);
  });

  it('keeps the rubble working right up to the moment it goes flat', () => {
    const { victim, crater } = crateredOn();
    run([crater], CRATER_RUBBLE_MS - 200);
    expect(crater.toRemove).toBe(false);
    victim.buffs.length = 0;
    tick([crater], 16);
    expect(victim.buffs.some(buff => buff instanceof api.buffs.Slow)).toBe(true);
  });

  it('opens no crater under a corpse', () => {
    // Nothing in this game outlives its caster. Killed mid-air, she comes
    // down and nothing happens.
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 90, 'red');
    indexObjects(game, [caster, victim]);

    pressSpell(new Sakura_R(caster), { caster, at: { x: 300, y: 0 } });
    const [leap] = inWorld(Sakura_R_Leap);
    tick([leap], 16);
    caster.stats.health.baseValue = 0;
    caster.die({ attacker: victim, reviveAfter: 5_000 });
    leapOf(caster)?.deactivateBuff();
    tick([leap], 16);

    expect(inWorld(Sakura_R_Crater)).toHaveLength(0);
    expect(victim.stats.health.value).toBe(100);
  });

  /** Landed, cratered, and the victim standing in it — the state four tests want. */
  function crateredOn() {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 90, 'red');
    indexObjects(game, [caster, victim]);

    pressSpell(new Sakura_R(caster), { caster, at: { x: 0, y: 0 } });
    const [leap] = inWorld(Sakura_R_Leap);
    leapOf(caster)!.deactivateBuff();
    tick([leap], 16);
    const [crater] = inWorld(Sakura_R_Crater);
    indexObjects(game, [caster, victim, crater]);
    return { caster, victim, crater };
  }
});
