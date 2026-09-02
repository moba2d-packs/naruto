import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, createGame, stubGameGlobals, type TestGame } from '@moba2d/core/testing';
import { pressSpell } from '@moba2d/core/testing/spell';

import Temari_Q, {
  Q_DAMAGE,
  Q_PUSH,
  Q_RANGE,
  Q_TRAVEL_MS,
  Q_WIDTH,
  Temari_Q_Gust,
} from '../spells/Temari_Q';
import Temari_W, {
  W_DURATION_MS,
  W_RADIUS,
  W_SLOW,
  W_TICKS,
  W_TICK_DAMAGE,
  W_TICK_MS,
  W_TOTAL_DAMAGE,
  Temari_W_Vortex,
} from '../spells/Temari_W';
import Temari_E, {
  E_DISTANCE,
  E_SLOW,
  E_WAKE_MS,
  E_WAKE_WIDTH,
  Temari_E_Wake,
} from '../spells/Temari_E';
import Temari_R, {
  R_BURST_DAMAGE,
  R_CATCH_DAMAGE,
  R_RADIUS,
  R_RANGE,
  R_THROW,
  Temari_R_Funnel,
} from '../spells/Temari_R';
import { champion, indexObjects, unit } from './_units';

/**
 * Temari's four, driven the way a key press drives them.
 *
 * Her whole kit moves bodies — pushes, pulls, rides and throws — so most of
 * this file asserts on *positions and displacement buffs* rather than on
 * health. The one number that matters more than the damage is which way
 * somebody ended up going.
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

const dashOn = (of: ReturnType<typeof unit>) =>
  of.buffs.find(buff => buff instanceof api.buffs.Dash) as
    | InstanceType<typeof api.buffs.Dash>
    | undefined;

beforeEach(() => {
  stubGameGlobals();
  vi.stubGlobal('deltaTime', 16);
  game = createGame(2_000);
  game.setPlayer(champion(game, 0, 'player-uuid'));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Kamaitachi no Jutsu (Q) — one swing, and it goes through', () => {
  const swung = (...victims: ReturnType<typeof unit>[]) => {
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster, ...victims]);
    expect(pressSpell(new Temari_Q(caster), { caster, at: { x: 600, y: 0 } })).toBe(true);
    const gust = born(inWorld(Temari_Q_Gust)[0]);
    indexObjects(game, [caster, ...victims, gust]);
    return { caster, gust };
  };

  it('hits nobody on the frame it is pressed', () => {
    const victim = unit(game, 300, 'red');
    swung(victim);
    expect(victim.stats.health.value).toBe(100);
  });

  it('cuts whoever it reaches on its way past', () => {
    const victim = unit(game, 300, 'red');
    const { gust } = swung(victim);
    run([gust], 600);
    expect(victim.stats.health.value).toBe(100 - Q_DAMAGE);
  });

  it('goes through the first body and hits the one behind it', () => {
    // The whole ability. Every other aimed skillshot in this pack stops on
    // the first thing it touches.
    const front = unit(game, 200, 'red');
    const back = unit(game, 340, 'red');
    const { gust } = swung(front, back);
    run([gust], 600);
    expect(front.stats.health.value).toBe(100 - Q_DAMAGE);
    expect(back.stats.health.value).toBe(100 - Q_DAMAGE);
  });

  it('cuts each body exactly once, however slow the frames were', () => {
    const victim = unit(game, 300, 'red');
    const { gust } = swung(victim);
    run([gust], 900, 4);
    expect(victim.stats.health.value).toBe(100 - Q_DAMAGE);
  });

  it('carries a caught body the way the wind was going', () => {
    // Not outward from a centre: the air moved that way, and the body has to
    // move with it or the picture is telling the player the wrong thing.
    const victim = unit(game, 300, 'red', 20);
    const { gust } = swung(victim);
    run([gust], 600);
    const blown = dashOn(victim);
    expect(blown, 'nothing moved them').toBeDefined();
    expect(blown!.dashDestination!.x).toBeCloseTo(300 + Q_PUSH, 0);
    expect(blown!.dashDestination!.y).toBeCloseTo(20, 0);
  });

  it('leaves alone somebody standing outside its width', () => {
    const aside = unit(game, 300, 'red', Q_WIDTH);
    const { gust } = swung(aside);
    run([gust], 600);
    expect(aside.stats.health.value).toBe(100);
  });

  it('stops cutting past its range, and leaves the air behind it', () => {
    const far = unit(game, Q_RANGE + 200, 'red');
    const { gust } = swung(far);
    // Just past the crossing, and well inside the fade that follows it —
    // `Q_TRAVEL_MS` is derived from the speed, so a retune moves this with it.
    run([gust], Q_TRAVEL_MS + 60);
    expect(far.stats.health.value).toBe(100);
    // It stops *cutting* at the end of its range; it does not blink out.
    expect(gust.toRemove).toBe(false);
  });
});

describe('Fūton: Tatsumaki (W) — the first thing here that pulls', () => {
  const opened = (victimX = 300) => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, victimX, 'red');
    indexObjects(game, [caster, victim]);
    expect(pressSpell(new Temari_W(caster), { caster, at: { x: 300, y: 0 } })).toBe(true);
    const vortex = born(inWorld(Temari_W_Vortex)[0]);
    indexObjects(game, [caster, victim, vortex]);
    return { caster, victim, vortex };
  };

  it('drags a body toward its middle, not away from it', () => {
    // Four champions can push, throw, shove and knock up. Nobody could bring
    // somebody closer, and her own Q blows people away — without this her
    // kit undoes itself.
    const { victim, vortex } = opened(300 + W_RADIUS - 20);
    run([vortex], 400);
    const dragged = dashOn(victim);
    expect(dragged, 'nothing pulled them').toBeDefined();
    const before = Math.abs(victim.position.x - vortex.position.x);
    const after = Math.abs(dragged!.dashDestination!.x - vortex.position.x);
    expect(after).toBeLessThan(before);
  });

  it('bites for what the tooltip quotes, and no more', () => {
    const { victim, vortex } = opened();
    run([vortex], W_DURATION_MS);
    expect(100 - victim.stats.health.value).toBe(W_TOTAL_DAMAGE);
  });

  it('lands exactly the number of bites the loop actually runs', () => {
    // `ceil - 1`, not `floor`: the loop runs only while it is still turning,
    // so a tick on the last millisecond never fires. Two abilities in this
    // pack have had the arithmetic and the loop disagree.
    expect(W_TICKS).toBe(Math.ceil(W_DURATION_MS / W_TICK_MS) - 1);
    expect(W_TOTAL_DAMAGE).toBe(W_TICK_DAMAGE * W_TICKS);
  });

  it('slows whoever is in it, and never stacks that slow', () => {
    const { victim, vortex } = opened();
    run([vortex], 600);
    const slows = victim.buffs.filter(buff => buff instanceof api.buffs.Slow);
    expect(slows).toHaveLength(1);
    expect((slows[0] as InstanceType<typeof api.buffs.Slow>).percent).toBe(W_SLOW);
  });

  it('leaves alone somebody standing outside it', () => {
    const { victim, vortex } = opened(300 + W_RADIUS + 90);
    run([vortex], W_DURATION_MS);
    expect(victim.stats.health.value).toBe(100);
  });

  it('spins down rather than blinking out', () => {
    const { vortex } = opened();
    run([vortex], W_DURATION_MS + 16);
    expect(vortex.toRemove).toBe(false);
  });
});

describe('Fūton: Renpū (E) — the way out, and the air she leaves in it', () => {
  const rode = () => {
    const caster = champion(game, 0, 'blue');
    const chaser = unit(game, 120, 'red');
    indexObjects(game, [caster, chaser]);
    expect(pressSpell(new Temari_E(caster), { caster, at: { x: 600, y: 0 } })).toBe(true);
    return { caster, chaser };
  };

  it('puts her on a gale toward where she aimed', () => {
    const { caster } = rode();
    const ride = caster.buffs.find(buff => buff instanceof api.buffs.Dash) as
      | InstanceType<typeof api.buffs.Dash>
      | undefined;
    expect(ride, 'she never left').toBeDefined();
    expect(ride!.dashDestination!.x).toBeCloseTo(E_DISTANCE, 0);
  });

  it('lays the wake down where she actually went', () => {
    const { caster } = rode();
    const ride = caster.buffs.find(buff => buff instanceof api.buffs.Dash) as
      | InstanceType<typeof api.buffs.Dash>
      | undefined;
    caster.position.set(E_DISTANCE, 0);
    ride!.onReachedDestination?.();

    const [wake] = inWorld(Temari_E_Wake);
    expect(wake, 'no air was left behind').toBeDefined();
    expect(wake.from.x).toBeCloseTo(0, 0);
    expect(wake.position.x).toBeCloseTo(E_DISTANCE, 0);
  });

  it('slows a chaser standing in that air, and hurts nobody', () => {
    const { caster, chaser } = rode();
    const ride = caster.buffs.find(buff => buff instanceof api.buffs.Dash) as
      | InstanceType<typeof api.buffs.Dash>
      | undefined;
    caster.position.set(E_DISTANCE, 0);
    ride!.onReachedDestination?.();
    const wake = born(inWorld(Temari_E_Wake)[0]);
    indexObjects(game, [caster, chaser, wake]);

    tick([wake], 16);
    const slow = chaser.buffs.find(buff => buff instanceof api.buffs.Slow) as
      | InstanceType<typeof api.buffs.Slow>
      | undefined;
    expect(slow, 'the wake slowed nobody').toBeDefined();
    expect(slow!.percent).toBe(E_SLOW);
    expect(chaser.stats.health.value).toBe(100);
  });

  it('leaves alone somebody standing beside the corridor', () => {
    const caster = champion(game, 0, 'blue');
    const aside = unit(game, 120, 'red', E_WAKE_WIDTH);
    indexObjects(game, [caster, aside]);
    pressSpell(new Temari_E(caster), { caster, at: { x: 600, y: 0 } });
    const ride = caster.buffs.find(buff => buff instanceof api.buffs.Dash) as
      | InstanceType<typeof api.buffs.Dash>
      | undefined;
    caster.position.set(E_DISTANCE, 0);
    ride!.onReachedDestination?.();
    const wake = born(inWorld(Temari_E_Wake)[0]);
    indexObjects(game, [caster, aside, wake]);

    tick([wake], 16);
    expect(aside.buffs.some(buff => buff instanceof api.buffs.Slow)).toBe(false);
  });

  it('still leaves the air she disturbed when the ride is interrupted', () => {
    const { caster } = rode();
    const ride = caster.buffs.find(buff => buff instanceof api.buffs.Dash) as
      | InstanceType<typeof api.buffs.Dash>
      | undefined;
    caster.position.set(E_DISTANCE / 2, 0);
    ride!.onCancelled?.();
    expect(inWorld(Temari_E_Wake)).toHaveLength(1);
  });

  it('lays exactly one wake per ride', () => {
    const { caster } = rode();
    const ride = caster.buffs.find(buff => buff instanceof api.buffs.Dash) as
      | InstanceType<typeof api.buffs.Dash>
      | undefined;
    ride!.onReachedDestination?.();
    ride!.onCancelled?.();
    expect(inWorld(Temari_E_Wake)).toHaveLength(1);
  });

  it('lets the air outlive its own slow', () => {
    const { caster } = rode();
    const ride = caster.buffs.find(buff => buff instanceof api.buffs.Dash) as
      | InstanceType<typeof api.buffs.Dash>
      | undefined;
    ride!.onReachedDestination?.();
    const wake = born(inWorld(Temari_E_Wake)[0]);
    run([wake], E_WAKE_MS + 16);
    expect(wake.toRemove).toBe(false);
  });
});

describe('Kirikiri Mai (R) — the column walks, and takes them with it', () => {
  const thrown = (victimX = 200) => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, victimX, 'red');
    indexObjects(game, [caster, victim]);
    expect(pressSpell(new Temari_R(caster), { caster, at: { x: 900, y: 0 } })).toBe(true);
    const funnel = born(inWorld(Temari_R_Funnel)[0]);
    indexObjects(game, [caster, victim, funnel]);
    return { caster, victim, funnel };
  };

  it('reaches nobody on the frame it is pressed', () => {
    const { victim } = thrown();
    expect(victim.stats.health.value).toBe(100);
  });

  it('catches a body on the way past, once', () => {
    const { victim, funnel } = thrown();
    run([funnel], 900);
    expect(victim.stats.health.value).toBe(100 - R_CATCH_DAMAGE);
  });

  it('drags whoever it caught along inside it', () => {
    const { victim, funnel } = thrown();
    run([funnel], 900);
    const dragged = dashOn(victim);
    expect(dragged, 'nothing carried them').toBeDefined();
  });

  it('bursts at the end of its line and throws them outward', () => {
    const { victim, funnel } = thrown();
    // Keep them inside it the whole way, which is what the drag is for.
    for (let spent = 0; spent < 4_000 && !funnel.spent; spent += 16) {
      victim.position.set(funnel.position.x, funnel.position.y + 20);
      indexObjects(game, [victim, funnel]);
      tick([funnel], 16);
    }
    expect(funnel.spent).toBe(true);
    expect(victim.stats.health.value).toBe(100 - R_CATCH_DAMAGE - R_BURST_DAMAGE);

    const flung = dashOn(victim);
    expect(flung, 'nothing threw them').toBeDefined();
    // Outward from the funnel, which is the opposite of what it was doing a
    // frame earlier — the release has to reverse the direction.
    const away = Math.hypot(
      flung!.dashDestination!.x - funnel.position.x,
      flung!.dashDestination!.y - funnel.position.y
    );
    expect(away).toBeGreaterThan(R_THROW * 0.8);
  });

  it('takes nobody with it if they step out of the line', () => {
    const { victim, funnel } = thrown(200);
    victim.position.set(200, R_RADIUS + 120);
    indexObjects(game, [victim, funnel]);
    run([funnel], 900);
    expect(victim.stats.health.value).toBe(100);
  });

  it('travels slowly enough to be walked out of', () => {
    // Gaara's ultimate was rebuilt for exactly this — an ability with no
    // middle has nothing for the art to show and nothing to answer. Half of
    // its range must still take longer than a second.
    const { funnel } = thrown(5_000);
    run([funnel], 1_000);
    expect(funnel.position.x).toBeLessThan(R_RANGE);
  });
});
