/**
 * Descriptions speak the engine's colour language.
 *
 * Core's stylesheets give a description exactly one vocabulary
 * (`styles/hud.css`, and the tokens in `styles/main.css`):
 *
 *   .damage.physical  amber   #ff923e
 *   .damage.magic     violet  #b07aff
 *   .damage.true      cyan    #5fd8f5
 *   .damage           plain emphasis — NOT a mitigated figure
 *   .heal             green   #6ee787
 *   .buff             a granted effect
 *   .time             a duration
 *
 * Those three damage hues are `DAMAGE_TEXT_COLOR` written as hex, so a
 * tooltip promising 34 magic damage is the colour of the 34 that floats off
 * the health bar. A number in the wrong colour is the tooltip disagreeing
 * with the game.
 *
 * The rule this file enforces is the one that actually drifted: this pack
 * shipped every number as bare `<span class="damage">` and bold `<b>` tags,
 * so nothing was colour-coded at all and a player could not tell a duration
 * from a damage figure. Reported from a real match.
 *
 * **A typed `.damage` is a claim, not decoration.** The HUD rescales a
 * tagged damage number by the reader's ability power (`Spell.effectiveDescription`),
 * so tagging a mana cost or a duration as damage makes the bar quietly
 * multiply a number that nothing scales.
 */
import { describe, expect, it } from 'vitest';
import { spellCatalog } from '../generated/spellCatalog';
import { data } from '../pack';

const DAMAGE_TYPES = ['physical', 'magic', 'true'];

describe('spell descriptions', () => {
  it('has descriptions to check', () => {
    expect(Object.keys(spellCatalog).length).toBeGreaterThan(0);
  });

  it('types every damage span', () => {
    // A bare `class="damage"` is legal in core and means plain emphasis, but
    // in this pack every one of them so far was a real damage figure that had
    // simply never been given its type. Requiring the type is what keeps the
    // next forty-seven from repeating it; a genuine emphasis span uses no
    // class at all, or `.buff`.
    const untyped: string[] = [];
    for (const [id, entry] of Object.entries(spellCatalog)) {
      const description = entry.description ?? '';
      for (const match of description.matchAll(/class="damage([^"]*)"/g)) {
        const modifiers = match[1].trim().split(/\s+/).filter(Boolean);
        if (!modifiers.some(modifier => DAMAGE_TYPES.includes(modifier))) {
          untyped.push(`${id}: class="damage${match[1]}"`);
        }
      }
    }
    expect(untyped).toEqual([]);
  });

  it('uses only classes core actually styles', () => {
    // A typo lands as unstyled text rather than an error, which is the
    // silent failure this catches — `class="dmg"` simply renders grey.
    const known = new Set(['damage', 'heal', 'buff', 'time', ...DAMAGE_TYPES]);
    const unknown: string[] = [];
    for (const [id, entry] of Object.entries(spellCatalog)) {
      for (const match of (entry.description ?? '').matchAll(/class="([^"]*)"/g)) {
        for (const name of match[1].trim().split(/\s+/).filter(Boolean)) {
          if (!known.has(name)) unknown.push(`${id}: ${name}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it('never makes a claim about the pack, or about being the only one', () => {
    // A tooltip says what the ability does. It is not the place to rank the
    // ability against the rest of the roster, and every such claim is a
    // sentence that goes quietly false the day somebody adds a champion:
    // "là chiêu choáng duy nhất của cả pack" was true for about four hours.
    //
    // Reported exactly that way: "1 spell thì ko nên nhắc tới pack, chắc gì
    // sau này nó là chiêu duy nhất có choáng, spell chỉ mô tả chiêu thức".
    const boasting: string[] = [];
    for (const [id, entry] of Object.entries(spellCatalog)) {
      const description = entry.description ?? '';
      if (/\bpack\b/i.test(description)) boasting.push(`${id}: names the pack`);
      if (/duy nhất/i.test(description)) boasting.push(`${id}: claims to be the only one`);
    }
    expect(boasting).toEqual([]);
  });

  it('never names a champion other than its own', () => {
    // The other half of the same rule. Naming the caster is ordinary tooltip
    // voice ("Kakashi lặn xuống đất"); naming somebody *else* makes the text
    // depend on a champion that may not be installed, may be renamed, or may
    // never have been read by this player.
    const firstNames = (data.champions ?? []).map(champion => champion.name.split(' ')[0]);
    const trespass: string[] = [];
    for (const [id, entry] of Object.entries(spellCatalog)) {
      const mine = id.split('_')[0];
      for (const name of firstNames) {
        if (name === mine) continue;
        if (new RegExp(`\\b${name}\\b`).test(entry.description ?? '')) {
          trespass.push(`${id}: names ${name}`);
        }
      }
    }
    expect(trespass).toEqual([]);
  });

  it('has champions to check the two rules above against', () => {
    // Both scans above pass vacuously on an empty roster, and one of them
    // reads `data.champions` to know what a trespass even is.
    expect((data.champions ?? []).length).toBeGreaterThan(1);
  });

  it('colour-codes every description that states a number', () => {
    // The symptom as a player met it: numbers on screen with no colour at
    // all. A description carrying a figure has to tag at least one span.
    const colourless: string[] = [];
    for (const [id, entry] of Object.entries(spellCatalog)) {
      const description = entry.description ?? '';
      if (!/\d/.test(description)) continue;
      if (!/class="(damage|heal|buff|time)/.test(description)) colourless.push(id);
    }
    expect(colourless).toEqual([]);
  });
});
