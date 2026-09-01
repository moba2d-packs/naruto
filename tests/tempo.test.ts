/**
 * This pack keeps the game fast.
 *
 * It did not. Reported after a match: "thời gian hồi chiêu của pack naruto lâu
 * vậy? moba2d là game tốc độ cao, chứ ko phải game chờ hồi chiêu" — and the
 * measurement agreed. Against the reference pack's 306 abilities:
 *
 *   reference   ultimates 3–10s (median 10, none above 10), basics 0–12s
 *   this pack   ultimates 90s and 95s, basics up to 26s
 *
 * Nine times the ceiling on both transforms, and nothing in this pack's build
 * compared a cooldown to anything, so nothing said so. The band now lives in
 * core (`@moba2d/core/testing/tempo`), where the next pack starts inside it.
 *
 * Bringing the two ultimates down to 10s moves the limiter rather than
 * removing it: a full Kurama Mode costs `100 + 15 x 22 = 430` chakra against
 * a 500 pool, and `Stats.manaRegen` is 0.1 *per frame* — 6/s — so the net 340
 * takes about a minute to earn back. Susanoo now bills the same way, for the
 * same reason. The gate is the bar the player can watch, not a countdown they
 * can only wait out.
 *
 * The durations came down with the cooldowns, because uptime is what a buff
 * actually costs: Sage Mode at 9 seconds on a 10-second cooldown would be a
 * permanent buff wearing a cooldown's clothes.
 */
import { describeTempo } from '@moba2d/core/testing/tempo';
import { describe, expect, it } from 'vitest';
import { data } from '../pack';
import { spellCatalog } from '../generated/spellCatalog';
import { E_DURATION_MS as SAGE_MS, E_COOLDOWN_MS as SAGE_CD } from '../spells/Naruto_E';
import { W_LIFETIME_MS, W_COOLDOWN_MS } from '../spells/Naruto_W';
import { E_DURATION_MS as SHARINGAN_MS, E_COOLDOWN_MS as SHARINGAN_CD } from '../spells/Sasuke_E';

describeTempo({
  label: 'naruto — nobody stands around waiting',
  spellCatalog,
  champions: (data.champions ?? []).filter(champion => champion.playable),
  // The form abilities, which no roster lists: they are what Q/W/E become
  // inside a transform, and they are on cooldowns like anything else.
  formSpells: Object.keys(spellCatalog).filter(id => /_[QWE]2$/.test(id)),
});

describe('a timed effect is shorter than its own cooldown', () => {
  // The rule core's band cannot check, because durations live in each spell's
  // own constants. Stated here for the three abilities that have one, on the
  // arithmetic that matters: an effect lasting as long as its cooldown is not
  // an ability, it is a passive with a cast time.
  it.each([
    ['Sennin Mōdo', SAGE_MS, SAGE_CD],
    ['Kage Bunshin', W_LIFETIME_MS, W_COOLDOWN_MS],
    ['Sharingan', SHARINGAN_MS, SHARINGAN_CD],
  ])('%s is down for longer than it is up', (_name, durationMs, coolDownMs) => {
    expect(durationMs).toBeLessThan(coolDownMs / 2 + 1);
  });
});
