/**
 * Every ability this pack ships has an icon.
 *
 * Not a polish rule — a correctness one. Core's `hudState.ts` builds the
 * spell bar with
 *
 *     (player.spells || []).filter(i => i?.image?.path)
 *
 * so an ability with no `image` is not merely plain in the bar, it is **not
 * in the bar**. It still casts on its hotkey and the player has no way to see
 * that it exists, what it costs, or whether it is off cooldown.
 *
 * That is how this test came to be written: Naruto shipped with all seven
 * abilities iconless, every one of them worked when pressed, and the bottom
 * of the screen was empty. Nothing in `verify` had an opinion, because
 * nothing had been asked.
 *
 * Read off `generated/spellCatalog.ts` rather than by importing the spell
 * classes, because that is the same file the pregame screen and the HUD
 * resolve an icon through — a spell whose class sets `image` but whose
 * catalogue row says `null` would be exactly as invisible.
 */
import { describe, expect, it } from 'vitest';
import { spellCatalog } from '../generated/spellCatalog';
import { data } from '../pack';

describe('spell icons', () => {
  it('is not an empty catalogue, so the checks below mean something', () => {
    expect(Object.keys(spellCatalog).length).toBeGreaterThan(0);
  });

  it('gives every catalogued ability an icon key', () => {
    const iconless = Object.entries(spellCatalog)
      .filter(([, entry]) => !entry.iconKey)
      .map(([id]) => id);
    expect(iconless).toEqual([]);
  });

  it('gives every ability in a playable kit an icon', () => {
    // The narrower question, asked separately: the catalogue could grow a row
    // for something no champion fields, and this is the set a player can
    // actually end up holding.
    const missing: string[] = [];
    for (const champion of data.champions ?? []) {
      if (!champion.playable) continue;
      for (const id of champion.spells ?? []) {
        const entry = spellCatalog[id as keyof typeof spellCatalog];
        if (!entry) {
          missing.push(`${champion.id}: ${id} is not in the catalogue at all`);
          continue;
        }
        if (!entry.iconKey) missing.push(`${champion.id}: ${id} has no icon`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('covers the form abilities too, which no kit lists', () => {
    // A transforming champion's Q2/W2/E2 are deliberately absent from every
    // `spells: [...]`, so the kit walk above cannot see them — and they are
    // exactly the ones a player stares at for fifteen seconds.
    const forms = Object.entries(spellCatalog).filter(([id]) => /_[QWER]\d+$/.test(id));
    expect(forms.length).toBeGreaterThan(0);
    for (const [id, entry] of forms) {
      expect(entry.iconKey, `${id} has no icon`).toBeTruthy();
    }
  });
});
