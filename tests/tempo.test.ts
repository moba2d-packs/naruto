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
import { W_DURATION_MS as SAND_SHIELD_MS, W_COOLDOWN_MS as SAND_SHIELD_CD } from '../spells/Gaara_W';
import { E_CROSSING_MS as SAND_WAVE_MS, E_COOLDOWN_MS as SAND_WAVE_CD } from '../spells/Gaara_E';
import { R_COOLDOWN_MS as OKASHO_CD, R_RUBBLE_MS } from '../spells/Sakura_R';
import { W_MEND_MS, W_COOLDOWN_MS as MEND_CD } from '../spells/Sakura_W';
import Naruto_Q from '../spells/Naruto_Q';
import Sasuke_E2 from '../spells/Sasuke_E2';

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
    ['Suna no Tate', SAND_SHIELD_MS, SAND_SHIELD_CD],
    ['Suna Nami', SAND_WAVE_MS, SAND_WAVE_CD],
    ['Ōkashō', R_RUBBLE_MS, OKASHO_CD],
    ['Shōsen Jutsu', W_MEND_MS, MEND_CD],
  ])('%s is down for longer than it is up', (_name, durationMs, coolDownMs) => {
    expect(durationMs).toBeLessThan(coolDownMs / 2 + 1);
  });
});

describe('a bot charges these to the top', () => {
  // `BotBrain` used to release every charge at half its window, so Rasengan
  // landed at 33 of its 18–48 and Indra's Arrow at 60 of its 45–75, always.
  // The default is full charge now — but only safely: a charge whose spec is
  // `releaseAtMax: false` is *cancelled* by the runtime at max, and the bot
  // stops short of it. Both of these fire themselves at the top instead, and
  // that is the fact worth pinning: flip either to `false` and the bot
  // quietly goes back to a weaker shot with nothing to say so.
  it.each([
    ['Rasengan', Naruto_Q],
    ["Indra's Arrow", Sasuke_E2],
  ])('%s fires itself at full charge', (_name, spell) => {
    expect(spell.prototype.castSpec.charge?.releaseAtMax).toBe(true);
    // No override: the default is already the strongest safe answer, and a
    // number here would be a second copy of the window waiting to drift.
    expect(spell.aiChargeReleaseAtMs).toBeUndefined();
  });
});
