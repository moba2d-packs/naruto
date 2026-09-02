import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, createGame, stubGameGlobals, type TestGame } from '@moba2d/core/testing';
import { pressSpell } from '@moba2d/core/testing/spell';

import Gaara_Q, { Q_DAMAGE, Q_RADIUS, Q_TELL_MS, Gaara_Q_Column } from '../spells/Gaara_Q';
import { Gaara_Q_Sand, SAND_SLOW, SAND_TICK_DAMAGE, SAND_TICK_MS } from '../spells/Gaara_Q_Sand';
import Gaara_W, {
  W_BURST_DAMAGE,
  W_BURST_RADIUS,
  W_SHIELD,
  Gaara_W_Shell,
} from '../spells/Gaara_W';
import Gaara_E, {
  E_CROSSING_MS,
  E_STANDOFF,
  E_TRAVEL,
  E_WALL_LENGTH,
  E_WALL_THICKNESS,
  Gaara_E_Wave,
} from '../spells/Gaara_E';
import Gaara_R, { R_CRUSH_DAMAGE, R_TOTAL_DAMAGE, R_TRAVEL_MS } from '../spells/Gaara_R';
import { GRIP_TICK_DAMAGE, GRIP_TICK_MS, Gaara_R_Grip } from '../spells/Gaara_R_Grip';
import { Gaara_R_Surge } from '../spells/Gaara_R_Surge';
import { champion, indexObjects, unit } from './_units';

/**
 * Gaara's four, driven the way a key press drives them.
 *
 * The test names are the script each ability was written from — see each
 * spell's own header. That is deliberate: `docs/ADDING_SPELLS.md` asks for
 * the player-visible sequence *before* the code, and the cheapest way to keep
 * that honest is to make the sequence the thing that is asserted.
 *
 * Everything goes through `pressSpell`, never a lifecycle hook. A hook called
 * directly sees no activation pattern, no resource commit, no cooldown and no
 * targeting rejection — which for `Gaara_R`, whose entire job is resolving a
 * target, would be testing nothing at all.
 */
const api = buildTestApi();
let game: TestGame;

const tick = (objects: { update(): void }[], ms: number): void => {
  vi.stubGlobal('deltaTime', ms);
  for (const object of objects) object.update();
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

describe('Suna Shigure (Q) — sand gathers, then erupts', () => {
  it('hurts nobody on the frame it is pressed', () => {
    // The whole ability is the warning. If the column landed instantly it
    // would be an ordinary point-and-click nuke with a decorative ring.
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const spell = new Gaara_Q(caster);
    expect(pressSpell(spell, { caster, at: { x: 200, y: 0 } })).toBe(true);
    expect(victim.stats.health.value).toBe(100);
  });

  it('erupts after the tell and hits whoever is still standing there', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const spell = new Gaara_Q(caster);
    pressSpell(spell, { caster, at: { x: 200, y: 0 } });
    const [column] = inWorld(Gaara_Q_Column);

    tick([column], Q_TELL_MS + 1);
    expect(victim.stats.health.value).toBe(100 - Q_DAMAGE);
  });

  it('lets someone who walked out of the ring take nothing', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const spell = new Gaara_Q(caster);
    pressSpell(spell, { caster, at: { x: 200, y: 0 } });
    const [column] = inWorld(Gaara_Q_Column);

    victim.position.set(200 + Q_RADIUS * 2, 0);
    tick([column], Q_TELL_MS + 1);
    expect(victim.stats.health.value).toBe(100);
  });

  it('slows whoever it caught', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    pressSpell(new Gaara_Q(caster), { caster, at: { x: 200, y: 0 } });
    tick(inWorld(Gaara_Q_Column), Q_TELL_MS + 1);

    const slows = victim.buffs.filter(buff => buff instanceof api.buffs.Slow);
    expect(slows).toHaveLength(1);
    expect((slows[0] as unknown as { percent: number }).percent).toBe(SAND_SLOW);
  });

  it('leaves a patch of sand behind when the column falls', () => {
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    pressSpell(new Gaara_Q(caster), { caster, at: { x: 200, y: 0 } });
    // Flush the add queue: `onRemoved` is the manager's call to make, and it
    // only makes it for objects it is actually holding.
    game.objectManager.update();
    const [column] = inWorld(Gaara_Q_Column);
    expect(inWorld(Gaara_Q_Sand)).toHaveLength(0);

    // Past the eruption and the settle, then let the manager retire it.
    tick([column], 5_000);
    game.objectManager.update();

    const [sand] = inWorld(Gaara_Q_Sand);
    expect(sand).toBeDefined();
    expect(sand.position.x).toBeCloseTo(200, 0);
  });

  it('keeps biting whoever stays in the patch', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const sand = new Gaara_Q_Sand(caster);
    sand.position.set(200, 0);
    game.objectManager.addObject(sand);
    sand.onAdded();

    tick([sand], SAND_TICK_MS + 1);
    expect(victim.stats.health.value).toBe(100 - SAND_TICK_DAMAGE);
  });

  it('renews the slow rather than stacking it into a standstill', () => {
    // `Slow` stacks ten deep by default, so a zone re-applying every tick
    // turns 35% into "cannot move" — the trap this pack's AGENTS.md writes
    // out, and the reason `RENEW_EXISTING` is in the zone at all.
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const sand = new Gaara_Q_Sand(caster);
    sand.position.set(200, 0);
    game.objectManager.addObject(sand);
    sand.onAdded();

    for (let bite = 0; bite < 4; bite++) tick([sand], SAND_TICK_MS + 1);

    const slows = victim.buffs.filter(buff => buff instanceof api.buffs.Slow);
    expect(slows).toHaveLength(1);
  });

  it('stops biting once it is visibly fading', () => {
    // Ground that is going out must not still be hurting people — the
    // picture is the tooltip.
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const sand = new Gaara_Q_Sand(caster);
    sand.position.set(200, 0);
    game.objectManager.addObject(sand);
    sand.onAdded();

    tick([sand], 2_100);
    const afterLinger = victim.stats.health.value;
    tick([sand], SAND_TICK_MS + 1);
    expect(victim.stats.health.value).toBe(afterLinger);
  });
});

describe('Suna no Tate (W) — the shield that always goes off', () => {
  const shellFor = (caster: ReturnType<typeof champion>): Gaara_W_Shell => {
    pressSpell(new Gaara_W(caster), { caster });
    const [shell] = inWorld(Gaara_W_Shell);
    shell.onAdded();
    return shell;
  };

  it('wraps him in a shield when pressed', () => {
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    pressSpell(new Gaara_W(caster), { caster });
    const shields = caster.buffs.filter(buff => buff instanceof api.buffs.Shield);
    expect(shields).toHaveLength(1);
    expect((shields[0] as unknown as { amount: number }).amount).toBe(W_SHIELD);
  });

  it('bursts when the shield is broken early', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 80, 'red');
    indexObjects(game, [caster, victim]);

    const shell = shellFor(caster);
    // Break it by hand: the shell watches the shield, not a clock.
    shell.shield!.amount = 0;
    tick([shell], 16);

    expect(victim.stats.health.value).toBe(100 - W_BURST_DAMAGE);
  });

  it('bursts the same way when the four seconds simply run out', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 80, 'red');
    indexObjects(game, [caster, victim]);

    const shell = shellFor(caster);
    shell.shield!.toRemove = true;
    tick([shell], 16);

    expect(victim.stats.health.value).toBe(100 - W_BURST_DAMAGE);
  });

  it('throws whoever the burst caught', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 80, 'red');
    indexObjects(game, [caster, victim]);

    const shell = shellFor(caster);
    shell.shield!.amount = 0;
    tick([shell], 16);

    expect(victim.buffs.some(buff => buff instanceof api.buffs.Airborne)).toBe(true);
  });

  it('leaves someone standing outside the ring alone', () => {
    const caster = champion(game, 0, 'blue');
    const far = unit(game, W_BURST_RADIUS * 2, 'red');
    indexObjects(game, [caster, far]);

    const shell = shellFor(caster);
    shell.shield!.amount = 0;
    tick([shell], 16);

    expect(far.stats.health.value).toBe(100);
  });

  it('bursts exactly once, however many ways the ending arrives', () => {
    // Death, a scene exit and the shield running out can converge on the
    // same frame, and the runtime is allowed to route one ending twice.
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 80, 'red');
    indexObjects(game, [caster, victim]);

    const shell = shellFor(caster);
    shell.shield!.amount = 0;
    tick([shell], 16);
    tick([shell], 16);
    tick([shell], 16);

    expect(victim.stats.health.value).toBe(100 - W_BURST_DAMAGE);
  });
});

describe('Suna Nami (E) — terrain that walks', () => {
  const waveFrom = (caster: ReturnType<typeof champion>, at: { x: number; y: number }) => {
    pressSpell(new Gaara_E(caster), { caster, at });
    const [wave] = inWorld(Gaara_E_Wave);
    wave.onAdded();
    return wave;
  };

  it('raises the ridge in front of him, never on him', () => {
    // A slab centred on his own feet resolves him to its *nearest* face,
    // which past the midplane is the far one — so the push would eject him
    // through his own ridge while it stopped everyone else.
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    const wave = waveFrom(caster, { x: 0, y: 0 });
    const gap = Math.hypot(
      wave.position.x - caster.position.x,
      wave.position.y - caster.position.y
    );
    expect(gap).toBeCloseTo(E_STANDOFF, 0);
  });

  it('advances — this is the whole ability', () => {
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    const wave = waveFrom(caster, { x: 400, y: 0 });
    const startX = wave.position.x;
    for (let frame = 0; frame < 30; frame++) tick([wave], 16);

    expect(wave.distanceTravelled).toBeGreaterThan(0);
    expect(wave.position.x).toBeGreaterThan(startX);
  });

  it('crosses its whole reach and then stops, rather than running forever', () => {
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    const wave = waveFrom(caster, { x: 400, y: 0 });
    for (let frame = 0; frame < 200; frame++) tick([wave], 16);

    expect(wave.distanceTravelled).toBeCloseTo(E_TRAVEL, 0);
  });

  it('measures its crossing on the clock, not on the frame rate', () => {
    // The same ground has to be covered on a phone dropping frames as on a
    // machine that is not. Two waves, same elapsed time, different steps.
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    const smooth = waveFrom(caster, { x: 400, y: 0 });
    for (let frame = 0; frame < 60; frame++) tick([smooth], 16);
    const smoothTravel = smooth.distanceTravelled;

    smooth.toRemove = true;
    const choppy = new Gaara_E_Wave(caster);
    choppy.heading = { x: 1, y: 0 };
    choppy.onAdded();
    for (let frame = 0; frame < 12; frame++) tick([choppy], 80);

    expect(choppy.distanceTravelled).toBeCloseTo(smoothTravel, 0);
  });

  it('declares itself terrain, so every wall-reading ability sees it', () => {
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    const wave = waveFrom(caster, { x: 400, y: 0 });
    expect(wave.blocksMovement).toBe(true);
    expect(wave.wallVertices()).toHaveLength(4);
    expect(wave.length).toBe(E_WALL_LENGTH);
    expect(wave.thickness).toBe(E_WALL_THICKNESS);
  });

  it('takes its collision along with it, instead of leaving it behind', () => {
    // The trap a moving wall has and a static one does not: the SAT polygon
    // carries its own position, so a body standing where the wave *started*
    // must stop being pushed once the wave has gone past.
    const caster = champion(game, 0, 'blue');
    const bystander = unit(game, 600, 'red');
    indexObjects(game, [caster, bystander]);

    const wave = waveFrom(caster, { x: 400, y: 0 });
    const born = { x: wave.position.x, y: wave.position.y };
    for (let frame = 0; frame < 60; frame++) tick([wave], 16);

    bystander.position.set(born.x, born.y);
    const before = { x: bystander.position.x, y: bystander.position.y };
    tick([wave], 16);
    expect(bystander.position.x).toBe(before.x);
    expect(bystander.position.y).toBe(before.y);
  });

  it('ploughs whoever is standing in front of it', () => {
    const caster = champion(game, 0, 'blue');
    const blocker = unit(game, 0, 'red');
    indexObjects(game, [caster, blocker]);

    const wave = waveFrom(caster, { x: 400, y: 0 });
    // Standing right where the ridge is about to be.
    blocker.position.set(wave.position.x + 10, 0);
    const startX = blocker.position.x;
    for (let frame = 0; frame < 40; frame++) tick([wave], 16);

    expect(blocker.position.x).toBeGreaterThan(startX);
  });

  it('lets a dash straight through, exactly as map terrain does', () => {
    const caster = champion(game, 0, 'blue');
    const dasher = unit(game, 0, 'red');
    indexObjects(game, [caster, dasher]);

    const wave = waveFrom(caster, { x: 400, y: 0 });
    dasher.position.set(wave.position.x, wave.position.y);
    dasher.stats.actionState |= api.enums.ActionState.IS_GHOSTED;
    // Compared against where the *dasher* was, not against the wave: the
    // ridge moves during the same frame, so asserting the two still agree
    // would fail for a reason that has nothing to do with the push.
    const stood = { x: dasher.position.x, y: dasher.position.y };
    tick([wave], 16);

    expect(dasher.position.x).toBe(stood.x);
    expect(dasher.position.y).toBe(stood.y);
  });

  it('stops being terrain once it stops moving, but stays on screen to sink', () => {
    const caster = champion(game, 0, 'blue');
    indexObjects(game, [caster]);

    const wave = waveFrom(caster, { x: 400, y: 0 });
    tick([wave], E_CROSSING_MS + 1);
    expect(wave.blocksMovement).toBe(false);
    // An effect deleted on the frame it stops working reads as a dropped
    // frame rather than as something that ended.
    expect(wave.toRemove).toBe(false);
  });

  it('deals no damage to anybody, ever', () => {
    const caster = champion(game, 0, 'blue');
    const bystander = unit(game, 120, 'red');
    indexObjects(game, [caster, bystander]);

    const wave = waveFrom(caster, { x: 400, y: 0 });
    for (let frame = 0; frame < 200; frame++) tick([wave], 16);
    expect(bystander.stats.health.value).toBe(100);
  });
});

describe('Sabaku Sōsō (R) — the sand crosses the ground first', () => {
  const surgeFrom = (caster: ReturnType<typeof champion>, at: { x: number; y: number }) => {
    expect(pressSpell(new Gaara_R(caster), { caster, at })).toBe(true);
    const [surge] = inWorld(Gaara_R_Surge);
    surge.onAdded();
    return surge;
  };

  it('sends a wave rather than simply happening to somebody', () => {
    // The report this ability was rebuilt from: "instant quá, ko có animation
    // gì bay từ Gaara tới kẻ địch, địch ko né đc". There is now a thing in
    // the world between him and them, and it takes time to arrive.
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 400, 'red');
    indexObjects(game, [caster, victim]);

    surgeFrom(caster, { x: 400, y: 0 });
    expect(victim.stats.health.value).toBe(100);
    expect(victim.buffs.some(buff => buff instanceof api.buffs.Root)).toBe(false);
  });

  it('takes long enough to cross that there is time to move', () => {
    // The number that makes the ability fair. Asserted rather than trusted,
    // because a speed retune is exactly how "dodgeable" quietly stops being
    // true — a second is the floor for a skillshot anyone can react to.
    expect(R_TRAVEL_MS).toBeGreaterThan(1_000);
  });

  it('grips the first body it reaches', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const surge = surgeFrom(caster, { x: 600, y: 0 });
    for (let frame = 0; frame < 60; frame++) tick([surge], 16);

    expect(victim.buffs.some(buff => buff instanceof api.buffs.Root)).toBe(true);
    expect(inWorld(Gaara_R_Grip)).toHaveLength(1);
  });

  it('takes one person, not the whole line', () => {
    // A wave that gripped everybody it crossed would be a team-wide root,
    // which is a different and much stronger ability.
    const caster = champion(game, 0, 'blue');
    const first = unit(game, 180, 'red');
    const second = unit(game, 330, 'red');
    indexObjects(game, [caster, first, second]);

    const surge = surgeFrom(caster, { x: 600, y: 0 });
    for (let frame = 0; frame < 90; frame++) tick([surge], 16);

    expect(first.buffs.some(buff => buff instanceof api.buffs.Root)).toBe(true);
    expect(second.buffs.some(buff => buff instanceof api.buffs.Root)).toBe(false);
  });

  it('misses somebody who stepped out of the line', () => {
    const caster = champion(game, 0, 'blue');
    const dodger = unit(game, 300, 'red');
    indexObjects(game, [caster, dodger]);

    const surge = surgeFrom(caster, { x: 600, y: 0 });
    // Sideways, which is the counterplay the whole rebuild exists to give.
    dodger.position.set(300, 400);
    for (let frame = 0; frame < 120; frame++) tick([surge], 16);

    expect(dodger.buffs.some(buff => buff instanceof api.buffs.Root)).toBe(false);
    expect(dodger.stats.health.value).toBe(100);
  });

  it('squeezes while it holds', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const grip = new Gaara_R_Grip(caster);
    grip.attachTo(victim);
    game.objectManager.addObject(grip);
    grip.onAdded();

    tick([grip], GRIP_TICK_MS + 1);
    expect(victim.stats.health.value).toBe(100 - GRIP_TICK_DAMAGE);
  });

  it('crushes at the end, for the biggest single hit in the kit', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const grip = new Gaara_R_Grip(caster);
    grip.attachTo(victim);
    game.objectManager.addObject(grip);
    grip.onAdded();

    // Driven at a real frame size, not in one jump: a single frame longer
    // than the whole root skips every squeeze, and would assert the crush
    // alone while looking like it asserted the ability.
    for (let frame = 0; frame < 120; frame++) tick([grip], 16);
    expect(100 - victim.stats.health.value).toBe(R_TOTAL_DAMAGE);
    expect(R_CRUSH_DAMAGE).toBeGreaterThan(GRIP_TICK_DAMAGE);
  });

  it('crushes exactly once', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const grip = new Gaara_R_Grip(caster);
    grip.attachTo(victim);
    game.objectManager.addObject(grip);
    grip.onAdded();

    for (let frame = 0; frame < 120; frame++) tick([grip], 16);
    const settled = victim.stats.health.value;
    tick([grip], 16);
    tick([grip], 16);
    expect(victim.stats.health.value).toBe(settled);
  });

  it('lands inside the band core sets for an ultimate', () => {
    // 40–60 against a ~100 health pool (`docs/VFX_STANDARD.md`).
    expect(R_TOTAL_DAMAGE).toBeGreaterThanOrEqual(40);
    expect(R_TOTAL_DAMAGE).toBeLessThanOrEqual(60);
  });

  it('falls away with the body it was holding', () => {
    const caster = champion(game, 0, 'blue');
    const victim = unit(game, 200, 'red');
    indexObjects(game, [caster, victim]);

    const grip = new Gaara_R_Grip(caster);
    grip.attachTo(victim);
    game.objectManager.addObject(grip);
    grip.onAdded();

    victim.toRemove = true;
    tick([grip], 16);
    expect(grip.toRemove).toBe(true);
  });
});
