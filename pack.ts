import type { ContentApi } from '@moba2d/core/content/ContentApi';
import type {
  ContentPackCode,
  ContentPackData,
  SpellDisplayData,
  SpellSource,
} from '@moba2d/core/content/ContentPack';
import { setPackApi } from './packApi';
import { spellCatalog } from './generated/spellCatalog';
import { spellModules } from './generated/spellModules';
import { map } from './map';

/**
 * Naruto — four champions, twenty-two abilities, one map.
 *
 * Four abilities per champion and not three, because core validates a pack
 * before installing it, and a `playable` champion there means exactly this: a
 * portrait, and a kit of four. A pack that ships three is not a pack with a
 * gap in it, it is a pack that fails to install, in a browser, after it is
 * already published.
 *
 * Twenty-two and not sixteen because Naruto's and Sasuke's ultimates are
 * *forms*: they swap the champion's own Q/W/E out for three others while they
 * hold, through `Champion.enterStance`. Those six extra abilities are
 * declared here like any other, and then deliberately kept out of
 * `spellDisplay` — see below. Gaara and Sakura have no form; their four are
 * their four.
 *
 * ## The two halves, and why the data one imports no spell
 *
 * `data` is inert: a roster, a map to list, and the display strings a picker
 * draws. It must be readable without ever building a `ContentApi`, because a
 * menu screen that only wants champion names should never load the engine
 * first — see `@moba2d/core/content/ContentPack`'s own header.
 *
 * So the numbers below come from `generated/spellCatalog.ts`, which the
 * catalogue generator produced by *constructing* each spell once at build
 * time and reading its fields. Nothing here imports `./spells/...`, and
 * nothing here may: a spell module reads `api` the moment it evaluates, and
 * at data-read time nobody has set one. `tests/dataHalf.test.ts` enforces it.
 *
 * `code` is the other half. It sets the api first — that single call is what
 * lets every spell file be an ordinary class declaration — and then hands
 * core a loader per spell, so a match downloads the kits in play.
 */
/**
 * The abilities the loadout screen may offer as *choosable*.
 *
 * A form's abilities are deliberately left out. `spellDisplay` is what a
 * hand-built kit picks from, and Bijuudama is not a thing anyone picks — it
 * is what Naruto's Q, W and E become while Kurama Mode holds. Leaving them in
 * would put three abilities in the picker that cost chakra, cast at will and
 * were balanced around a fifteen-second window, available to anyone, forever.
 *
 * Matched on the id's own shape — a slot letter followed by a digit, so
 * `Naruto_Q2` is out and `Naruto_Q` is in — rather than a hand-kept list,
 * because the seventh form ability is exactly the one somebody forgets to add
 * to a list. It is the same problem `Item_` already solved in the Dota pack,
 * and the same shape of answer.
 */
const FORM_SPELL_ID = /_[QWER]\d+$/;

const displayData = (): Record<string, SpellDisplayData> => {
  const out: Record<string, SpellDisplayData> = {};
  for (const [id, entry] of Object.entries(spellCatalog)) {
    if (FORM_SPELL_ID.test(id)) continue;
    out[id] = {
      name: entry.name,
      description: entry.description,
      iconKey: entry.iconKey,
      coolDownMs: entry.coolDownMs,
      manaCost: entry.manaCost,
      specCoolDownMs: entry.specCoolDownMs,
    };
  }
  return out;
};

export const data: ContentPackData = {
  // `coreRange` is the oldest core this pack works against. Core parses
  // exactly two shapes — `*` and `>=X.Y.Z` — and treats anything else as
  // unsatisfiable, so `^1` is not a loose range, it is a pack that refuses to
  // install. `scripts/write-manifest.mjs` states the same floor for the
  // published manifest; raise both together.
  // 1.21 is where `Champion.enterStance` and the slot-keyed `SpellSlot`
  // landed, and both ultimates here are built on them. Anything older
  // installs and then fails in a match, which is the failure this floor
  // exists to turn into a refusal — and note that a *dev-linked* checkout
  // typechecks against the core beside it, so this floor is the only thing
  // standing between an unpublished core symbol and a red CI run.
  manifest: { id: 'naruto', version: '1.0.0', coreRange: '>=1.22.0' },
  champions: [
    {
      id: 'naruto',
      name: 'Naruto Uzumaki',
      // A key in this pack's own `generated/assetManifest.ts`, never one of
      // core's — see the `pack-asset-key` seam. The key is the file's path
      // under `assets/` with the extension dropped and its folder mapped to a
      // prefix, so `assets/images/champions/naruto.png` is `champ_naruto`.
      image: 'champ_naruto',
      playable: true,
      // A melee bruiser who wants to be in the middle of it: middling reach,
      // middling swing, and everything that matters in the abilities.
      attack: { damage: 15, attacksPerSecond: 0.95, range: 135 },
      // Four, and only four. The three Kurama-mode abilities are not a kit
      // entry — they are what `Naruto_R` swaps into slots 0-2 while the form
      // holds, and core refuses to install a playable champion that does not
      // declare exactly four.
      spells: [
        'Naruto_Q',
        'Naruto_W',
        'Naruto_E',
        'Naruto_R',
        // moba2d-pack-add spell: new slot ids go above this line
      ],
    },
    {
      id: 'sasuke',
      name: 'Sasuke Uchiha',
      image: 'champ_sasuke',
      playable: true,
      // A melee assassin: hits harder than Naruto and takes it worse, and
      // every ability is about arriving on one person rather than holding a
      // fight open.
      attack: { damage: 17, attacksPerSecond: 1.0, range: 130 },
      spells: ['Sasuke_Q', 'Sasuke_W', 'Sasuke_E', 'Sasuke_R'],
    },
    {
      id: 'gaara',
      name: 'Gaara',
      image: 'champ_gaara',
      playable: true,
      // A ranged controller, and the first champion here who does not want to
      // be where the fight is. He hits softly and slowly on purpose: the sand
      // does the work, and the sand is placed rather than swung.
      attack: { damage: 12, attacksPerSecond: 0.72, range: 340 },
      spells: ['Gaara_Q', 'Gaara_W', 'Gaara_E', 'Gaara_R'],
    },
    {
      id: 'sakura',
      name: 'Sakura Haruno',
      image: 'champ_sakura',
      playable: true,
      // Melee, and the first champion here whose kit is pointed at her own
      // team as well as at the other one. She hits hard and slowly — the
      // swing is not what she is for, and the numbers say so before the
      // abilities do.
      attack: { damage: 16, attacksPerSecond: 0.85, range: 130 },
      spells: ['Sakura_Q', 'Sakura_W', 'Sakura_E', 'Sakura_R'],
    },
    {
      id: 'shikamaru',
      name: 'Shikamaru Nara',
      image: 'champ_shikamaru',
      playable: true,
      // Ranged, and the softest hitter in the pack by a distance. That is the
      // champion: his Q deals no damage at all, and the kit wins fights by
      // deciding where people are standing rather than by removing them.
      attack: { damage: 13, attacksPerSecond: 0.8, range: 320 },
      spells: ['Shikamaru_Q', 'Shikamaru_W', 'Shikamaru_E', 'Shikamaru_R'],
    },
    {
      id: 'temari',
      name: 'Temari',
      image: 'champ_temari',
      playable: true,
      // The longest basic attack in the pack, and the slowest. She is built
      // to be somewhere else: every ability moves a body, and the swing is
      // what she does while deciding which one.
      attack: { damage: 12, attacksPerSecond: 0.75, range: 400 },
      spells: ['Temari_Q', 'Temari_W', 'Temari_E', 'Temari_R'],
    },
    {
      id: 'kakashi',
      name: 'Kakashi Hatake',
      image: 'champ_kakashi',
      playable: true,
      // A skirmisher: he swings quickly and reaches a little further than the
      // other melee champions here, because his whole kit is about being
      // beside somebody for a moment and then not being there.
      attack: { damage: 15, attacksPerSecond: 0.95, range: 160 },
      spells: ['Kakashi_Q', 'Kakashi_W', 'Kakashi_E', 'Kakashi_R'],
    },
  ],
  spellDisplay: displayData(),
  maps: [map],
};

const code = (api: ContentApi): ContentPackCode => {
  // **First, and before anything reaches a spell module.** Every class in
  // `spells/` is declared against `packApi.ts`'s `api`, so this call is what
  // makes them constructible at all. The loaders below are lazy, so nothing
  // has evaluated yet when this runs.
  setPackApi(api);

  const spells: Record<string, SpellSource> = {};
  for (const [id, load] of Object.entries(spellModules)) {
    spells[id] = () => load().then(module => module.default);
  }
  return { spells };
};

export default code;
