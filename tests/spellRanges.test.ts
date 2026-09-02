/**
 * Ranges stay inside the band core actually documents.
 *
 * `docs/VFX_STANDARD.md` says it plainly — *"skillshots 350–500"*, scaled to
 * this canvas rather than to a PC game's wiki numbers — and this pack shipped
 * its first kit at 520/640/760/900 anyway. What that reads as in a match is a
 * melee bruiser who never has to approach anyone, which is not the champion.
 * Reported as "sao tầm của mấy spell naruto xa dữ vậy".
 *
 * The ceiling here is 650 rather than 500 because the band has justified
 * exceptions and they are named in `RANGE_BAND`: a grab stretches because
 * reaching *is* the ability, and the heaviest ultimate line earns the top of
 * it. Anything past 650 is not an exception, it is drift.
 */
import { describe, expect, it } from 'vitest';
import { spellCatalog } from '../generated/spellCatalog';
import { RANGE_BAND } from '../spellVfx';
import Naruto_Q, { Q_RANGE } from '../spells/Naruto_Q';
import { Q2_RANGE } from '../spells/Naruto_Q2';
import { W2_RANGE } from '../spells/Naruto_W2';
import { E2_RANGE } from '../spells/Naruto_E2';
import { Q_RANGE as GAARA_Q_RANGE } from '../spells/Gaara_Q';
import { E_TRAVEL as GAARA_E_TRAVEL } from '../spells/Gaara_E';
import { R_RANGE as GAARA_R_RANGE } from '../spells/Gaara_R';
import { Q_LENGTH as SAKURA_Q_LENGTH } from '../spells/Sakura_Q';
import { W_RANGE as SAKURA_W_RANGE } from '../spells/Sakura_W';
import { E_REACH as SAKURA_E_REACH } from '../spells/Sakura_E';
import { R_RANGE as SAKURA_R_RANGE } from '../spells/Sakura_R';
import { Q_REACH as SHIKA_Q_REACH } from '../spells/Shikamaru_Q';
import { W_RANGE as SHIKA_W_RANGE } from '../spells/Shikamaru_W';
import { E_RANGE as SHIKA_E_RANGE } from '../spells/Shikamaru_E';

/** The widest anything in this pack may reach. See the header. */
const CEILING = RANGE_BAND.ULTIMATE_LINE;

describe('spell ranges', () => {
  it('keeps every aimed ability inside the band', () => {
    const overshot = Object.entries({
      Q_RANGE,
      Q2_RANGE,
      W2_RANGE,
      E2_RANGE,
      GAARA_Q_RANGE,
      GAARA_E_TRAVEL,
      GAARA_R_RANGE,
      SAKURA_W_RANGE,
      SAKURA_R_RANGE,
      SHIKA_Q_REACH,
      SHIKA_E_RANGE,
    }).filter(
      ([, range]) => range > CEILING
    );
    expect(overshot).toEqual([]);
  });

  it('states the band in one place, so a retune cannot drift per file', () => {
    // Each of the four reads a named slot rather than carrying its own
    // number. That is what makes the ceiling above enforceable at all.
    expect(Q_RANGE).toBe(RANGE_BAND.ABILITY);
    expect(Q2_RANGE).toBe(RANGE_BAND.UPGRADED);
    expect(W2_RANGE).toBe(RANGE_BAND.GRAB);
    expect(E2_RANGE).toBe(RANGE_BAND.ULTIMATE_LINE);
    expect(GAARA_Q_RANGE).toBe(RANGE_BAND.ABILITY);
    expect(GAARA_E_TRAVEL).toBe(RANGE_BAND.PLACED);
    expect(GAARA_R_RANGE).toBe(RANGE_BAND.ULTIMATE_LINE);
    expect(SAKURA_W_RANGE).toBe(RANGE_BAND.ABILITY);
    expect(SAKURA_R_RANGE).toBe(RANGE_BAND.ABILITY);
    expect(SHIKA_Q_REACH).toBe(RANGE_BAND.ABILITY);
    expect(SHIKA_E_RANGE).toBe(RANGE_BAND.ABILITY);
    // A trap is placed, so it takes the placed band — the shortest reach in
    // the pack, for the reason that slot documents.
    expect(SHIKA_W_RANGE).toBe(RANGE_BAND.PLACED);
  });

  it('keeps a melee swing shorter than anything anybody places', () => {
    // Sakura's Q and E are the only reaches in the pack with no slot of their
    // own, and deliberately so: they are arm's length, not skillshots, and a
    // band written for skillshots has nothing true to say about them. What is
    // true is the ordering — a punch reaches less far than a wall somebody
    // drops, which is the shortest *placed* thing there is.
    expect(SAKURA_Q_LENGTH).toBeLessThan(RANGE_BAND.PLACED);
    expect(SAKURA_E_REACH).toBeLessThan(RANGE_BAND.PLACED);
  });

  it('orders the band the way the abilities are meant to feel', () => {
    // A form upgrade must out-reach the ability it replaces, or entering the
    // form is a downgrade nobody can see.
    expect(RANGE_BAND.UPGRADED).toBeGreaterThan(RANGE_BAND.ABILITY);
    expect(RANGE_BAND.GRAB).toBeGreaterThan(RANGE_BAND.UPGRADED);
    expect(RANGE_BAND.ULTIMATE_LINE).toBeGreaterThan(RANGE_BAND.GRAB);
    // A placed structure is the shortest reach in the pack: it shapes the
    // ground its caster is standing on, not a fight somebody else is having.
    expect(RANGE_BAND.PLACED).toBeLessThan(RANGE_BAND.ABILITY);
  });

  it('has the ability declare the range the HUD ring draws', () => {
    // `Spell.range` is what `drawPreview` measures. A constant the module
    // exports but the class does not read is a number that lies to the ring.
    const owner = { game: undefined } as never;
    expect(new Naruto_Q(owner).range).toBe(Q_RANGE);
  });

  it('has something to check', () => {
    expect(Object.keys(spellCatalog).length).toBeGreaterThan(0);
  });
});
