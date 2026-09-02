# Naruto

A `@moba2d/core` content pack: three champions, eighteen abilities, and a
build that publishes itself. Naruto and Sasuke transform — the ultimate swaps
three of their own abilities out for three others — which is what made this
pack the one that pushed `Champion.enterStance` into core. Gaara does not
transform at all; he moves the ground instead.

Install it into a running game by pasting this into **Tìm pack**:

```
https://moba2d-packs.github.io/naruto/manifest.json
```

## The roster

**Naruto Uzumaki** — a melee bruiser who wants to be in the middle of it.

| Slot | Ability | What it is |
|------|---------|-----------|
| Q | Rasengan | Charged. Hold to gather chakra, release to throw; the sphere and its vortex both grow with the hold. |
| W | Kage Bunshin | Three clones at 55% attack damage and triple damage taken. Recast to order them to the cursor. |
| E | Sennin Mōdo | Self buff: attack speed, attack range and move speed for 5s. |
| R | Kurama Mode | 15s form. Costs 22 energy per second, so it can end by running dry as well as by timer. Recast to drop it early. |

While Kurama Mode holds, Q/W/E become **Bijuu Rasengan**, **Kurama Arms**
and **Bijuudama** — a charged piercing sphere that detonates at the end of
its line.

**Sasuke Uchiha** — a melee assassin: hits harder, takes it worse, and every
ability is about arriving on one person.

| Slot | Ability | What it is |
|------|---------|-----------|
| Q | Chidori | The dash-and-stab. |
| W | Gōkakyū no Jutsu | The fireball. |
| E | Sharingan | A sweep that grants sight — **one way only**, which `tests/sharinganDirection.test.ts` pins. |
| R | Susanoo | 15s form, priced in chakra rather than in a long cooldown. |

Susanoo swaps in **Yasaka Magatama**, **Amaterasu** and **Indra's Arrow**.

**Gaara** — the one who does not want to be where the fight is. Ranged, slow
to swing, and every ability is about ground rather than about bodies.

| Slot | Ability | What it is |
|------|---------|-----------|
| Q | Suna Shigure | A column erupts at a point after a visible 0.4s gather, then leaves a patch that keeps biting and slowing for 2.2s. |
| W | Suna no Tate | A shield. When it breaks **or** when it expires it bursts, damaging and throwing nearby enemies — both endings pay. |
| E | Suna Nami | A ridge of sand that **advances**, ploughing whoever is in front of it along. Real terrain, and the only terrain in either pack that moves. |
| R | Sabaku Sōsō | A slow wave along the ground; the first body it reaches is rooted, squeezed, then crushed. It travels for about a second and a half, so it can be walked out of. |

Nothing of his deals damage in a single big number. His clear is one full
patch plus the shield burst, which is what `tests/waveclear.test.ts` pins —
area and repetition, the way `docs/VFX_STANDARD.md` says a clear should come.

## What is not done yet

`map.ts` / `geometry.ts` still ship the **scaffold arena** — one wall band,
one 200px gap, no turrets and no camps. It loads and it is playable, and it
is not a map anyone designed. That is the largest open piece of work in this
repository.

There are also no items, no monsters, and nine champions' worth of room on a
roster that currently holds three — the portraits for ten more are already
fetched and on the ledger.

## Run this next

```
npm install
npm run verify
```

`verify` is the core-link check + art check + generated-file checks +
typecheck + `check-unused` + `check-seams` + the published build + tests, in
that order. It is **this pack's own gate**: `npm install` never runs it for
you, and core's own `verify` never reaches into a pack it does not own.
`npm run hooks:install` points git at `scripts/git-hooks/`, and from then on
every `git push` runs `verify` first — `git push --no-verify` skips it once,
on purpose.

### The trap that verify cannot catch for you

`npm run verify` passing locally does **not** mean CI will pass, and the
reason is structural. If this checkout is dev-linked to a core beside it
(`npm run pack:link -- ../naruto`, run from core), then
`node_modules/@moba2d/core` is a symlink to that working copy — so the pack
typechecks against a core that may have unpushed commits in it. CI installs
`github:moba2d-game/core#main` fresh, every run.

So a pack that reaches for a core symbol that is not on core's `main` yet is
green at home and red in CI, with a `Property 'X' does not exist` that reads
like the pack's fault. **Push core before pushing the pack that needs it.**
This pack's `coreRange` is `>=1.21.0` because `Champion.enterStance` and
`api.enums.SpellSlot` landed there, and both transforms are built on them.

## Play it before you publish it

You do not need a copy of core. Serve your own build and install it into a
game that is already running somewhere:

```
npm run build
npm run serve      # -> http://localhost:5174/manifest.json
```

Paste that URL into the game's **Packs → Thêm bằng URL**. From then on
`npm run build` is the whole loop — core notices the new build and offers you
a reload, because a pack served from `localhost` is never pinned or cached.

Safari blocks `http://localhost` from an `https://` page; use Chrome or
Firefox, or put a tunnel in front of the port. `docs/PACK_AUTHORING.md` in
`@moba2d/core` has the long form.

## Publish it

`.github/workflows/publish.yml` builds and deploys `dist/` to GitHub Pages on
every push to `main`. Pages must be turned on once, by hand, at **Settings →
Pages → Source: GitHub Actions**, or every run fails at the deploy step with
a permissions error that reads like a broken token; nothing is broken.

Any static host that serves `access-control-allow-origin: *` and a JavaScript
MIME type for `.js` works exactly as well — core `fetch`es the manifest and
`import()`s the entry cross-origin, and that is the whole of what it needs.

## Where things live

- `pack.ts` — the whole pack's declaration, in two halves. `data` is inert
  (roster, map, display strings) and must be readable without an engine;
  `code` hands this pack its `api` and then a loader per spell. `data` also
  filters the form abilities out of `spellDisplay`, on the id's own shape
  (`_[QWER]\d+$`), so a loadout screen cannot hand anyone Bijuudama as a
  free pick.
- `spells/` — one file per ability plus the `SpellObject`s each one spawns,
  which is why thirty-six files back eighteen abilities. A charged ability is
  typically three (charge, projectile, aftermath) because the phases outlive
  each other.
- `spells/index.ts` — the barrel. Adding a spell means adding one line here
  and one id to the champion's kit; everything else is generated.
- `spellVfx.ts` — the pack's shared drawing helpers, `RANGE_BAND` and
  `SIGHT`. Two abilities that are meant to reach the same distance should
  read the same constant, not the same number typed twice.
- `AGENTS.md` — **read this before changing anything.** Recipes for adding,
  editing and removing an ability, a champion or a piece of art, each as a
  literal sequence of commands, plus the traps that cost real time and are
  invisible from the file you are editing.
- `packApi.ts` — where the engine arrives. Its header says why a pack cannot
  `import { Spell }` at all, and which three callers set the api before any
  spell module evaluates.
- `assets/` — this pack's art. Champion portraits come from
  `naruto.fandom.com` through `npm run art:import`, which records a hash per
  file in `assets/source-manifest.json`; `npm run art:check` (part of
  `verify`) fails if a file was edited without going through it. Three
  ability icons are fetched the same way, from URLs named in `ICON_SOURCES`;
  the rest are still the lettered placeholders `npm run art:placeholders`
  draws, which never overwrites a real icon. They are not taken off the wiki
  because its jutsu images are 1920x1080 cinematic frames and a 128px centre
  crop of one is a smudge.
- `public/` — the one directory Vite copies verbatim, and therefore where the
  shelf tile lives. Core's packs screen hot-links `icon.png` off this pack's
  published root, so it cannot be an `assets/` file: those are content-hashed
  into filenames nothing outside the build can spell, and re-encoded besides.
- `tools/preview-shape.mjs` — renders a shape to SVG/PNG without launching
  the game. Use it before porting any hand-drawn geometry into a spell: a
  shape cannot be reviewed by reading it.
- `tests/` — one file per ability, plus the cross-cutting ones that are
  easy to forget exist: `packInstallable` (core's own validator says yes),
  `build` (what `dist/` actually emitted), `spellIcons` (an ability with no
  icon is missing from the spell bar entirely, not just ugly),
  `spellDescriptions` (the damage-colour vocabulary), `waveclear`,
  `tempo`, `botRoles` and `spellSight`.
- `generated/` — gitignored, rebuilt by `prepare` after every install:
  `assetManifest.ts`, `spellCatalog.ts` and `spellModules.ts`. This is why
  the data half restates no number and imports no spell. **Never edit a file
  in here** — the next generate overwrites it, and `verify` fails when the
  two disagree.
- `map.ts` / `geometry.ts` — the world this pack ships. `geometry.ts` is
  fetched lazily, so a pregame picker never downloads the walls and lanes
  just to list this map's name.
- `catalog.config.mjs` — this pack's layout, as the catalogue generator
  needs it. `apiSetter` is the line that matters: it is how the generator
  hands this pack its engine before loading the barrel.
- `runtime-entry.ts` / `vite.config.ts` — the published build. Each carries
  its own header; `vite.config.ts`'s four settings are load-bearing and every
  one of them is a failure that has actually happened.

## Before you write an ability

Three documents in `@moba2d/core`, in this order, and all three were learned
the expensive way on this pack:

- `docs/ADDING_SPELLS.md` — write the script first, one line per
  interaction; those lines become the test names. Also: `castSpec` is read
  once on the first cast and frozen, and `onRecast` is handed the context of
  the **opening** press, so aim repeats with `this.aimPoint`.
- `docs/VFX_STANDARD.md` — anticipation → climax → **dissipation**, and
  dissipation is the one everyone skips. Skillshots want a missile speed
  around 9–11, not 19–24; impacts spawn particles on the victim, not at the
  missile's last position; a lingering area's fill dies before its rim.
- `AGENTS.md`, here — the pack-specific half of the same job.

Minion health is 70 / 45 / 150 (melee / ranged / cannon). Size waveclear
against those numbers, not against other abilities.
