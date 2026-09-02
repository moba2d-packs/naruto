/**
 * Can each champion actually kill a minion?
 *
 * This exists because "yếu quá, dame phép nhiều mà clear lính ko nổi" was a
 * real report and there was no way to check it: every damage number in the
 * pack was inside core's 15–35 band, every ability typechecked, and Sasuke
 * still could not kill a single melee minion with anything he had.
 *
 * So the thresholds are pinned against the engine's own minion health rather
 * than against a feeling. From `tuningDefaults.ts`:
 *
 *     melee 70    ranged 45    cannon 150
 *
 * The point is not that every ability one-shots a wave — it is that each
 * champion has *something* that does, and that the numbers are compared to
 * the thing they have to kill instead of to each other.
 */
import { describe, expect, it } from 'vitest';
import {
  Q2_DAMAGE as NARUTO_Q2,
  Q2_MAX_DAMAGE as NARUTO_Q2_FULL,
  Q2_MAX_SPLASH_DAMAGE,
  Q2_SPLASH_DAMAGE,
} from '../spells/Naruto_Q2';
import { E2_DAMAGE as NARUTO_E2_TAP, E2_MAX_DAMAGE as NARUTO_E2 } from '../spells/Naruto_E2';
import { W_DAMAGE as SASUKE_W, W_SPLASH } from '../spells/Sasuke_W';
import { BLAZE_BURN_MS, BLAZE_TICK_DAMAGE, BLAZE_TICK_MS } from '../spells/Sasuke_W_Blaze';
import { Q_DAMAGE as SASUKE_Q, Q_SHOCK } from '../spells/Sasuke_Q';
import { Q2_DAMAGE as SASUKE_Q2 } from '../spells/Sasuke_Q2';
import { E2_MAX_DAMAGE as SASUKE_E2 } from '../spells/Sasuke_E2';
import { Q_MAX_DAMAGE as NARUTO_Q_MAX, chargedDamage } from '../spells/Naruto_Q';
import { Q_DAMAGE as GAARA_Q } from '../spells/Gaara_Q';
import { SAND_TICK_DAMAGE, SAND_TOTAL_DAMAGE } from '../spells/Gaara_Q_Sand';
import { W_BURST_DAMAGE as GAARA_W } from '../spells/Gaara_W';
import { Q_DAMAGE as SAKURA_Q } from '../spells/Sakura_Q';
import { E_BLEED_TICK, E_DAMAGE as SAKURA_E, E_TOTAL_DAMAGE as SAKURA_E_TOTAL } from '../spells/Sakura_E';
import { CRATER_DAMAGE as SAKURA_R } from '../spells/Sakura_R_Crater';
import { Q_DAMAGE as TEMARI_Q } from '../spells/Temari_Q';
import { W_TICK_DAMAGE, W_TOTAL_DAMAGE as TEMARI_W_TOTAL } from '../spells/Temari_W';
import { Q_DAMAGE as KAKASHI_Q } from '../spells/Kakashi_Q';
import { E_DAMAGE as KAKASHI_E } from '../spells/Kakashi_E';
import { R_DAMAGE as KAKASHI_R } from '../spells/Kakashi_R';

/** `tuningDefaults.ts` — the bodies a laner actually has to remove. */
const MELEE = 70;
const RANGED = 45;

/** Everything one Gōkakyū does to a body that stands in the fire it leaves. */
const gokakyuTotal = SASUKE_W + BLAZE_TICK_DAMAGE * Math.floor(BLAZE_BURN_MS / BLAZE_TICK_MS);

describe('waveclear', () => {
  it('lets Sasuke remove a melee minion with one Gōkakyū', () => {
    // The ability that was supposed to be his clear and was not: 18 on the
    // way through plus a 7-per-half-second burn is 53 against a 70 body.
    expect(gokakyuTotal).toBeGreaterThan(MELEE);
  });

  it('lets Gōkakyū catch more than the one body it passed through', () => {
    // A wave stands three abreast. A strict pierce reaches one of them.
    // The splash alone does not kill anything — the burn underneath it is
    // what finishes, which is the ability asking them to move.
    expect(W_SPLASH).toBeGreaterThan(0);
    expect(SASUKE_W + W_SPLASH + BLAZE_TICK_DAMAGE).toBeGreaterThan(RANGED);
  });

  it('gives Chidori something to do when he lands in a group', () => {
    // An assassin lands in groups. Single target meant the button did
    // nothing to the four people standing around the one he hit.
    expect(Q_SHOCK).toBeGreaterThan(0);
    expect(SASUKE_Q).toBeGreaterThan(0);
  });

  it('lets the Susanoo form clear with overlapping blades, not with one', () => {
    // Honest about what the spread actually does. The three blades diverge,
    // so how many reach one body depends on range: close in, all three
    // overlap and a melee minion dies; further out, two catch a caster. One
    // blade is deliberately not enough for anything — that is what stops the
    // ability being a single button that deletes a wave at any distance.
    expect(SASUKE_Q2 * 3).toBeGreaterThan(MELEE);
    expect(SASUKE_Q2 * 2).toBeGreaterThan(RANGED);
    expect(SASUKE_Q2).toBeLessThan(RANGED);
  });

  it("lets Indra's Arrow remove a melee minion at full draw", () => {
    expect(SASUKE_E2).toBeGreaterThan(MELEE);
  });

  it('keeps Naruto able to clear too, so this is not a one-sided retune', () => {
    // The breakpoint a player feels without being told it exists: a fully
    // charged Rasengan has to actually remove the caster it lands on, or the
    // wave visibly survives and the ability reads as weak. It was one point
    // short.
    expect(chargedDamage(1)).toBe(NARUTO_Q_MAX);
    expect(chargedDamage(1)).toBeGreaterThan(RANGED);
    expect(NARUTO_Q2 + Q2_SPLASH_DAMAGE).toBeGreaterThan(RANGED);
    expect(NARUTO_E2).toBeGreaterThan(RANGED);
    // And the *tap* clears too. Both of Naruto's form abilities charge now,
    // and a charge that is required for the ability to do its job at all is
    // not a choice, it is a delay — so the floor has to be worth pressing.
    expect(NARUTO_E2_TAP, 'a tapped Bijuudama still kills a caster').toBeGreaterThan(RANGED);
    expect(NARUTO_Q2 + Q2_SPLASH_DAMAGE, 'a tapped Bijuu Rasengan too').toBeGreaterThan(RANGED);
    // Charging is what turns clearing into killing: a full throw pairs the
    // maximum of both halves, and that is what has to beat a melee minion.
    expect(NARUTO_Q2_FULL + Q2_MAX_SPLASH_DAMAGE).toBeGreaterThan(MELEE);
  });

  it('lets Gaara clear with ground rather than with a nuke', () => {
    // He has no single number that removes anything, on purpose: his whole
    // kit is area and repetition, which is exactly what the standard says a
    // clear is supposed to come from. The column alone is 22 against a 45
    // body — what kills is standing in the sand afterwards.
    expect(GAARA_Q).toBeLessThan(RANGED);
    expect(GAARA_Q + SAND_TOTAL_DAMAGE).toBeGreaterThan(RANGED);
  });

  it('makes him spend two buttons on a melee minion, not one', () => {
    // The breakpoint that decides whether he can hold a lane alone. One full
    // patch does not remove a 70 body; the patch plus the shield burst does,
    // which is the pair of buttons his kit actually wants pressed together.
    expect(GAARA_Q + SAND_TOTAL_DAMAGE).toBeLessThan(MELEE);
    expect(GAARA_Q + SAND_TOTAL_DAMAGE + GAARA_W).toBeGreaterThan(MELEE);
  });

  it('makes Sakura swing for a melee minion, and never for a ranged one', () => {
    // She is the first champion here who is not primarily a way of removing
    // somebody, and the clear says so honestly: a punch and a cut together
    // take a caster off the board, and a melee body needs a basic attack on
    // top. She is standing next to the wave anyway — that is what melee is.
    expect(SAKURA_Q + SAKURA_E_TOTAL).toBeGreaterThan(RANGED);
    expect(SAKURA_Q + SAKURA_E_TOTAL).toBeLessThan(MELEE);
  });

  it('does not let her ultimate become the wave clear', () => {
    // 48 removes a caster and leaves a melee minion standing. An ultimate
    // that one-shot a wave would be the reason to press it, and pressing it
    // to farm is not what a ten-second engage is for.
    expect(SAKURA_R).toBeGreaterThan(RANGED);
    expect(SAKURA_R).toBeLessThan(MELEE);
  });

  it('lets Temari clear a caster with one gust and a vortex', () => {
    // The piercing gust is the point: one press reaches the whole row, and
    // what finishes them is standing in the wind afterwards. Same argument
    // Gaara's clear makes — area and repetition, not one growing number.
    expect(TEMARI_Q).toBeLessThan(RANGED);
    expect(TEMARI_Q + TEMARI_W_TOTAL).toBeGreaterThan(RANGED);
    expect(TEMARI_Q + TEMARI_W_TOTAL).toBeLessThan(MELEE);
  });

  it('makes Kakashi clear by standing in the wave, which is where he lives', () => {
    // His discharge is self-centred, so clearing costs him position — the
    // trade every one of his abilities asks for. Q and E together remove a
    // caster; a melee body needs a swing on top.
    expect(KAKASHI_Q + KAKASHI_E).toBeGreaterThan(RANGED);
    expect(KAKASHI_Q + KAKASHI_E).toBeLessThan(MELEE);
  });

  it('keeps his ultimate a single-target answer, not a clear', () => {
    // 55 true damage on one body. It removes a caster and leaves the wave —
    // which is right for the only ability in the pack a build cannot answer.
    expect(KAKASHI_R).toBeGreaterThan(RANGED);
    expect(KAKASHI_R).toBeLessThan(MELEE);
  });

  it('keeps single-hit numbers inside the band core sets', () => {
    // 15–35 for an ability, 40–60 for an ultimate (`docs/VFX_STANDARD.md`).
    // The clear above comes from *area and repetition*, not from one number
    // quietly growing past what the rest of the game is tuned against.
    // Charged abilities are the stated exception and are priced like an
    // ultimate — they cost a second of standing still with a growing tell.
    for (const single of [
      SASUKE_Q,
      SASUKE_W,
      SASUKE_Q2,
      Q_SHOCK,
      W_SPLASH,
      BLAZE_TICK_DAMAGE,
      GAARA_Q,
      GAARA_W,
      SAND_TICK_DAMAGE,
      SAKURA_Q,
      SAKURA_E,
      E_BLEED_TICK,
      TEMARI_Q,
      W_TICK_DAMAGE,
      KAKASHI_Q,
      KAKASHI_E,
    ]) {
      expect(single).toBeLessThanOrEqual(35);
    }
    expect(chargedDamage(0)).toBeLessThanOrEqual(35);
  });
});
