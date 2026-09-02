/**
 * The VFX rules a scan can hold.
 *
 * Every visual failure this pack has shipped was a rule its author had read
 * that week — `docs/VFX_STANDARD.md` was open in another tab. So the ones
 * that *can* be checked are checked, and they live in core
 * (`@moba2d/core/testing/vfx`) because each is a fact about the **engine**:
 * what `MissileSpellObject` carries, which globals p5 supplies, which globals
 * the test harness supplies. This pack cannot get any of them right by
 * reading its own source, and neither can the next one.
 *
 * What this deliberately does **not** check is the half that decides whether
 * an ability looks like anything. Those are eyes-only, and `npm run e2e:vfx`
 * is the answer — its first run here found that Gaara's ultimate rendered a
 * gold starburst instead of sand closing on somebody, against a green build
 * and thirty-seven passing tests. See `AGENTS.md`.
 */
import { describeVfxRules } from '@moba2d/core/testing/vfx';
import { join } from 'node:path';

describeVfxRules({
  label: 'naruto — VFX rules a scan can hold',
  spellsDir: join(__dirname, '../spells'),
  // `file:rule` pairs not fixed yet. Every entry is something a player will
  // eventually report, so an empty list is the goal and not a formality.
  knownDebt: [],
});
