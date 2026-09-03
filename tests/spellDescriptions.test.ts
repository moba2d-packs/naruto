import { describeSpellDescriptions } from '@moba2d/core/testing/spellText';
import { spellCatalog } from '../generated/spellCatalog';
import { data } from '../pack';

/**
 * This pack's coloured numbers, held to core's rules instead of a private copy
 * of them.
 *
 * The scan that used to live here restated core's stylesheet vocabulary and
 * then checked, by reading Vietnamese prose, that each span looked like a
 * figure. Two other packs had scans of their own doing a *different* subset of
 * the same job, which is how a defect caught in one shipped in the others.
 *
 * None of it is needed now: `api.text.dmg(amount, type, tail)` writes the
 * markup, so a span cannot be missing its damage type, cannot lose its leading
 * figure to a `+`, and cannot be a duration or a strike count wearing the
 * damage colour by accident. `@moba2d/core/testing/spellText` holds the seams
 * a helper cannot close on its own — chiefly that nothing in this pack is
 * still typed by hand.
 */
describeSpellDescriptions({
  descriptions: () => [
    ...Object.entries(spellCatalog).map(
      ([id, spell]): [string, string] => [id, spell.description]
    ),
    ...Object.values(data.items ?? {}).map(
      (item): [string, string] => [`item ${item.id}`, item.description ?? '']
    ),
  ],
});
