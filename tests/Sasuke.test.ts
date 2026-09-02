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
import Sasuke_E, { E_REVEAL_RADIUS, REVEAL_STACK_ID } from '../spells/Sasuke_E';
import { E2_SPEED, Sasuke_E2_Object } from '../spells/Sasuke_E2';
import { Sasuke_E2_Trace } from '../spells/Sasuke_E2_Trace';
import { Q_SPEED as NARUTO_Q_SPEED } from '../spells/Naruto_Q';
import { Q2_SPEED as NARUTO_Q2_SPEED } from '../spells/Naruto_Q2';
import { E2_SPEED as NARUTO_E2_SPEED } from '../spells/Naruto_E2';
import { W_SPEED as SASUKE_W_SPEED } from '../spells/Sasuke_W';
import { W2_SPEED as NARUTO_W2_SPEED } from '../spells/Naruto_W2';
import { W2_SPEED as SASUKE_W2_SPEED } from '../spells/Sasuke_W2';
import { Q2_SPEED as SASUKE_Q2_SPEED } from '../spells/Sasuke_Q2';
import Sasuke_R, { R_CHAKRA_PER_SECOND, R_SHIELD, SUSANOO_STANCE } from '../spells/Sasuke_R';
import { basicAttackStub, champion, indexObjects, unit } from './_units';

const SLOT = buildTestApi().enums.SpellSlot;
/**
 * The engine's real pool. `Stats.ts` defaults mana to 500 and
 * `ChampionDefenceTuning` has no mana field, so this is what every champion
 * in every pack actually has — and Susanoo's upkeep is only honest against
 * that number.
 */
const REAL_MANA = 500;
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

describe('who Sharingan actually reveals', () => {
  // Asked from a real match: "lộ mọi tướng địch... đang khiến sasuke cũng bị
  // lộ luôn??" The reveal is one-directional and this is the measurement that
  // says so — the alternative was believing either answer.
  const cast = () => {
    const caster = sasuke();
    const enemy = champion(game, 400, 'red');
    const friend = champion(game, 300, 'blue');
    indexObjects(game, [caster, enemy, friend]);
    pressSpell(caster.spells[SLOT.E]);
    return { caster, enemy, friend };
  };

  const revealed = (unit: { buffs: { name: string }[] }): boolean =>
    unit.buffs.some(buff => buff.name === 'Lộ Diện');

  it('lights the enemy', () => {
    expect(revealed(cast().enemy)).toBe(true);
  });

  it('does not light Sasuke himself', () => {
    expect(revealed(cast().caster)).toBe(false);
  });

  it('does not light his own team either', () => {
    expect(revealed(cast().friend)).toBe(false);
  });

  it('puts the sight on the enemy and gives it to Sasuke’s team', () => {
    // The direction lives in one field: `TrueSight` stands a vision source at
    // the *target's* position carrying the *source's* team. Swap that and the
    // ability would hand the enemy a free eye on themselves.
    const { caster, enemy } = cast();
    const eyes = (
      inWorld(buildTestApi().GameObject as never) as unknown as {
        visionRadius?: number;
        teamId: string;
        position: { x: number };
      }[]
    ).filter(candidate => (candidate.visionRadius ?? 0) > 0);
    expect(eyes).toHaveLength(1);
    expect(eyes[0].teamId).toBe(caster.teamId);
    expect(Math.round(eyes[0].position.x)).toBe(Math.round(enemy.position.x));
  });

  it('reveals from a slot of its own', () => {
    // `TrueSight` is REPLACE_EXISTING and `addBuff` groups by `stackId`, so a
    // reveal on the default id contends with every other reveal in the game —
    // core measured four spells cutting each other short over one slot. This
    // file used to build `TrueSight` directly and opt out of the question.
    expect(REVEAL_STACK_ID).toBeTruthy();
    const { enemy } = cast();
    const lit = enemy.buffs.find(buff => buff.name === 'Lộ Diện');
    expect(lit?.stackId).toBe(REVEAL_STACK_ID);
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

  it('bills chakra a second at a time, and never per frame', () => {
    // The upkeep is what replaced a ninety-five-second cooldown, so it is the
    // only thing standing between a ten-second cooldown and a shell that is
    // up more often than it is down. A drain billed per frame would be sixty
    // times the tooltip; one billed never would be no limiter at all.
    const caster = sasuke();
    caster.stats.mana.baseValue = REAL_MANA;
    caster.stats.maxMana.baseValue = REAL_MANA;
    indexObjects(game, [caster]);
    pressSpell(caster.spells[SLOT.R]);
    caster.stats.mana.baseValue = REAL_MANA;

    for (let frame = 0; frame < 30; frame++) advance(caster, 16);
    expect(caster.stats.mana.value).toBe(REAL_MANA);

    advance(caster, 1_000);
    expect(caster.stats.mana.value).toBe(REAL_MANA - R_CHAKRA_PER_SECOND);
  });

  it('does not take the shell away for an empty pool', () => {
    // The same rule Kurama Mode already keeps, for the same reported reason:
    // an ability that stops for something the player cannot see reads as
    // broken even when the arithmetic is right. The two endings stay the ones
    // they can watch — the shell breaking, and their own second press.
    const caster = sasuke();
    indexObjects(game, [caster]);
    pressSpell(caster.spells[SLOT.R]);
    caster.stats.mana.baseValue = 0;

    for (let elapsed = 0; elapsed < 5_000; elapsed += 1_000) advance(caster, 1_000);

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

describe('Indra’s Arrow is fast, not invisible', () => {
  /**
   * Reported as "mũi tên cũng đang nhanh và khó thấy quá", and the pack's own
   * numbers agreed: every other missile here runs 9–16 and this one ran 26,
   * at a smaller size than most. 650px at 26 is about four tenths of a
   * second — not a skillshot, a hitscan with an animation nobody sees.
   */
  it('stays the fastest thing either champion throws, without being three times the median', () => {
    // Every other missile in the pack, so the claim is about the roster and
    // not about whichever four this file happened to import.
    const others = [
      NARUTO_Q_SPEED,
      NARUTO_Q2_SPEED,
      NARUTO_E2_SPEED,
      NARUTO_W2_SPEED,
      SASUKE_W_SPEED,
      SASUKE_W2_SPEED,
      SASUKE_Q2_SPEED,
    ];
    expect(E2_SPEED).toBeGreaterThan(Math.max(...others));
    expect(E2_SPEED).toBeLessThan(Math.max(...others) * 1.5);
  });

  it('leaves the line it flew on behind it', () => {
    // The larger half of the fix. It could not be seen because it left
    // *nothing* — and on a shot that pierces everything and stops at max
    // range, "it came from there and ended here" has no other way to reach
    // the player.
    const caster = sasuke();
    indexObjects(game, [caster]);
    const arrow = new Sasuke_E2_Object(caster);
    arrow.onAdded();
    arrow.position.set(500, 40);

    arrow.onRemoved();

    const traces = inWorld(Sasuke_E2_Trace);
    expect(traces).toHaveLength(1);
    expect(Math.round(traces[0].to.x)).toBe(500);
  });
});
