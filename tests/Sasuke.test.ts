/**
 * Sasuke, tested against the script that was written before the code — which
 * is what `docs/ADDING_SPELLS.md` asks for, and what the last three rounds of
 * rework on this pack were caused by skipping.
 *
 *   Chidori   press → he dashes; the first enemy takes it and is stunned;
 *                     he stops there rather than passing through
 *   Gōkakyū   press → a fireball pierces the line; where it stops the ground
 *                     burns for a few seconds
 *   Sharingan press → every enemy champion in a wide circle is revealed, and
 *                     he swings and moves faster
 *   Susanoo   press → a shell rises and Q/W/E change; the shell breaking ends
 *                     the form; a second press puts it down early
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, createGame, stubGameGlobals, type TestGame } from '@moba2d/core/testing';
import { pressSpell } from '@moba2d/core/testing/spell';
import Sasuke_Q from '../spells/Sasuke_Q';
import Sasuke_W, { Sasuke_W_Object } from '../spells/Sasuke_W';
import {
  BLAZE_GROW_MS,
  BLAZE_TICK_DAMAGE,
  BLAZE_TICK_MS,
  Sasuke_W_Blaze,
} from '../spells/Sasuke_W_Blaze';
import Sasuke_E, { E_REVEAL_RADIUS } from '../spells/Sasuke_E';
import Sasuke_R, { R_SHIELD, SUSANOO_STANCE } from '../spells/Sasuke_R';
import { basicAttackStub, champion, indexObjects, unit } from './_units';

const SLOT = buildTestApi().enums.SpellSlot;
let game: TestGame;

const sasuke = () => {
  const unit_ = champion(game, 0, 'blue');
  unit_.replaceSpells([
    basicAttackStub(unit_),
    new Sasuke_Q(unit_),
    new Sasuke_W(unit_),
    new Sasuke_E(unit_),
    new Sasuke_R(unit_),
  ]);
  return unit_;
};

const inWorld = <T>(kind: new (...args: never[]) => T): T[] =>
  [
    ...(game.objectManager.objects as unknown[]),
    ...((game.objectManager as { _objectToBeAdd?: unknown[] })._objectToBeAdd ?? []),
  ].filter(o => o instanceof kind) as T[];

/**
 * The live `Dash` the spell hung on him, typed for the two things this suite
 * drives. Found by class rather than by a duck-typed field: `Dash` is the
 * real buff, and matching on "has a dashDestination" would also match the
 * next buff that grows one.
 */
const dashOn = (unit_: ReturnType<typeof sasuke>) => {
  const Dash = buildTestApi().buffs.Dash;
  const found = unit_.buffs.find(buff => buff instanceof Dash);
  expect(found).toBeDefined();
  return found as unknown as { onDashUpdate(): void; dashDestination: { x: number } };
};

const advance = (unit_: ReturnType<typeof sasuke>, ms: number): void => {
  vi.stubGlobal('deltaTime', ms);
  for (const spell of unit_.spells) spell.update();
  for (const buff of [...unit_.buffs]) buff.update();
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

describe('Chidori', () => {
  it('dashes him forward', () => {
    const caster = sasuke();
    indexObjects(game, [caster]);
    const Dash = buildTestApi().buffs.Dash;

    pressSpell(caster.spells[SLOT.Q], { at: { x: 400, y: 0 } });

    expect(caster.buffs.some(buff => buff instanceof Dash)).toBe(true);
  });

  it('hits and stuns the first body it reaches, once', () => {
    const caster = sasuke();
    const victim = unit(game, 40, 'red');
    indexObjects(game, [caster, victim]);
    const Stun = buildTestApi().buffs.Stun;
    const before = victim.stats.health.baseValue;

    pressSpell(caster.spells[SLOT.Q], { at: { x: 400, y: 0 } });
    const dash = dashOn(caster);
    dash.onDashUpdate();
    const afterOne = victim.stats.health.baseValue;
    dash.onDashUpdate();

    expect(afterOne).toBeLessThan(before);
    expect(victim.stats.health.baseValue).toBe(afterOne);
    expect(victim.buffs.some(buff => buff instanceof Stun)).toBe(true);
  });

  it('stops him at the target rather than carrying him through', () => {
    // The character of the ability: it is a commitment, not an escape.
    const caster = sasuke();
    const victim = unit(game, 40, 'red');
    indexObjects(game, [caster, victim]);

    pressSpell(caster.spells[SLOT.Q], { at: { x: 400, y: 0 } });
    const dash = dashOn(caster);
    dash.onDashUpdate();

    expect(dash.dashDestination.x).toBe(caster.position.x);
  });
});

describe('Gōkakyū', () => {
  it('sets the ground alight where the fireball stops', () => {
    const caster = sasuke();
    indexObjects(game, [caster]);

    const ball = new Sasuke_W_Object(caster);
    ball.position.set(300, 0);
    ball.onRemoved();

    expect(inWorld(Sasuke_W_Blaze)).toHaveLength(1);
  });

  it('burns on a real clock, not once per frame', () => {
    // A per-frame burn is sixty times the tooltip on a good machine and a
    // fifth of it on a bad one.
    const caster = sasuke();
    const victim = unit(game, 0, 'red');
    indexObjects(game, [caster, victim]);
    const blaze = new Sasuke_W_Blaze(caster);
    blaze.position.set(0, 0);
    blaze.onAdded();

    const untouched = victim.stats.health.baseValue;

    // 12 frames of 16ms is 192ms — still inside the 200ms spread, so nothing
    // may have burned yet. An area that hurts before it has drawn itself is
    // an area nobody could have read.
    vi.stubGlobal('deltaTime', 16);
    for (let frame = 0; frame < 12; frame++) blaze.update();
    expect(victim.stats.health.baseValue).toBe(untouched);

    // Past the spread and one whole tick: exactly one tick's worth, not one
    // per frame.
    vi.stubGlobal('deltaTime', BLAZE_GROW_MS + BLAZE_TICK_MS);
    blaze.update();
    expect(victim.stats.health.baseValue).toBe(untouched - BLAZE_TICK_DAMAGE);
  });

  it('stops burning once it is visibly going out', () => {
    const caster = sasuke();
    const victim = unit(game, 0, 'red');
    indexObjects(game, [caster, victim]);
    const blaze = new Sasuke_W_Blaze(caster);
    blaze.position.set(0, 0);
    blaze.onAdded();

    vi.stubGlobal('deltaTime', 60_000);
    blaze.update();
    const settled = victim.stats.health.baseValue;
    blaze.update();

    expect(victim.stats.health.baseValue).toBe(settled);
  });
});

describe('Sharingan', () => {
  it('reveals enemy champions in the circle', () => {
    const caster = sasuke();
    const near = unit(game, E_REVEAL_RADIUS - 100, 'red');
    indexObjects(game, [caster, near]);
    const TrueSight = buildTestApi().buffs.TrueSight;

    pressSpell(caster.spells[SLOT.E]);

    expect(near.buffs.some(buff => buff instanceof TrueSight)).toBe(true);
  });

  it('leaves anyone outside it alone', () => {
    const caster = sasuke();
    const far = unit(game, E_REVEAL_RADIUS + 400, 'red');
    indexObjects(game, [caster, far]);
    const TrueSight = buildTestApi().buffs.TrueSight;

    pressSpell(caster.spells[SLOT.E]);

    expect(far.buffs.some(buff => buff instanceof TrueSight)).toBe(false);
  });

  it('speeds his swing up, and puts it back', () => {
    const caster = sasuke();
    indexObjects(game, [caster]);
    const before = caster.stats.attackSpeed.value;

    pressSpell(caster.spells[SLOT.E]);
    expect(caster.stats.attackSpeed.value).toBeGreaterThan(before);

    for (let step = 0; step < 8; step++) advance(caster, 1_000);
    expect(caster.stats.attackSpeed.value).toBe(before);
  });
});

describe('Susanoo', () => {
  it('changes Q, W and E and leaves the basic attack alone', () => {
    const caster = sasuke();
    const attack = caster.spells[SLOT.ATTACK];
    indexObjects(game, [caster]);

    pressSpell(caster.spells[SLOT.R]);

    expect(caster.stance).toBe(SUSANOO_STANCE);
    expect(caster.spells[SLOT.ATTACK]).toBe(attack);
    expect(caster.spells.map(spell => spell.name)).toEqual([
      'Đánh thường',
      'Yasaka Magatama',
      'Amaterasu',
      "Indra's Arrow",
      'Susanoo',
    ]);
  });

  it('puts a shell on him', () => {
    const caster = sasuke();
    indexObjects(game, [caster]);

    pressSpell(caster.spells[SLOT.R]);

    expect(caster.shieldAmount).toBe(R_SHIELD);
  });

  it('ends when the shell breaks, not when a clock runs out', () => {
    // The whole reason this champion has a transform too: Naruto's ends on a
    // countdown and the enemy waits it out, this one ends on a pool and the
    // enemy can break it themselves.
    const caster = sasuke();
    indexObjects(game, [caster]);
    pressSpell(caster.spells[SLOT.R]);
    expect(caster.stance).toBe(SUSANOO_STANCE);

    caster.takeDamage(R_SHIELD + 20, caster);
    advance(caster, 16);

    expect(caster.stance).toBe(null);
  });

  it('holds while the shell holds', () => {
    const caster = sasuke();
    indexObjects(game, [caster]);
    pressSpell(caster.spells[SLOT.R]);

    caster.takeDamage(40, caster);
    advance(caster, 16);

    expect(caster.stance).toBe(SUSANOO_STANCE);
  });

  it('comes down on a second press', () => {
    const caster = sasuke();
    indexObjects(game, [caster]);
    pressSpell(caster.spells[SLOT.R]);

    advance(caster, 1_000);
    pressSpell(caster.spells[SLOT.R]);

    expect(caster.stance).toBe(null);
  });

  it('takes its shell and its slow down with it', () => {
    // Both outlive the form by default — a permanent shield and a permanent
    // slow left behind would be the two halves of an ability nobody can end.
    const caster = sasuke();
    indexObjects(game, [caster]);
    pressSpell(caster.spells[SLOT.R]);

    pressSpell(caster.spells[SLOT.R]);

    expect(caster.shieldAmount).toBe(0);
    const Slow = buildTestApi().buffs.Slow;
    expect(caster.buffs.some(buff => buff instanceof Slow && !buff.toRemove)).toBe(false);
  });
});
