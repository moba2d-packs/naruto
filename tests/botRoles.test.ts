/**
 * A bot has to actually press these.
 *
 * Reported from a real match: bots holding Naruto or Sasuke never transformed.
 * They were not blocked — the ultimate was castable, in reach, and scored
 * *positive*. It simply scored **4** while an ordinary Q scored **14**, so the
 * bot picked Q every time Q was up, which is nearly always.
 *
 * The cause is core's `inferRoles` being deliberately conservative: it reads
 * every `SELF` cast as `Buff | Shield` and refuses to guess `Dash` or `Summon`
 * at all, because a wrong guess there makes a bot flee with a gap-closer.
 * `Spell.aiRoles` is the field that exists for exactly this, and core's own
 * docs note that nothing had ever set it.
 *
 * So this file checks the tags are present and *say the right thing*, because
 * the failure mode is silent: an untagged ability still works, still scores,
 * and is simply never chosen.
 */
import { describe, expect, it } from 'vitest';
import { buildTestApi } from '@moba2d/core/testing';
import Naruto_R from '../spells/Naruto_R';
import Naruto_W from '../spells/Naruto_W';
import Sasuke_R from '../spells/Sasuke_R';
import Sasuke_Q from '../spells/Sasuke_Q';
import Naruto_Q from '../spells/Naruto_Q';
import Sasuke_W from '../spells/Sasuke_W';

const Role = buildTestApi().enums.SpellRole;
const has = (mask: number | undefined, role: number): boolean => ((mask ?? 0) & role) !== 0;

describe('bot roles', () => {
  it('marks both transforms as something worth pressing in a fight', () => {
    // `Burst` is what lifts them above an ordinary poke ability in the
    // scorer. Without it a transform is filed beside a passive self-buff.
    for (const ultimate of [Naruto_R, Sasuke_R]) {
      expect(has(ultimate.aiRoles, Role.Burst)).toBe(true);
      expect(has(ultimate.aiRoles, Role.Buff)).toBe(true);
    }
  });

  it("calls Susanoo a shield, because it is one", () => {
    expect(has(Sasuke_R.aiRoles, Role.Shield)).toBe(true);
  });

  it('tells the bot Chidori is a dash', () => {
    // The one core refuses to infer, and the reason it refuses: a bot that
    // thinks its gap-closer is an escape runs *at* whatever is chasing it.
    expect(has(Sasuke_Q.aiRoles, Role.Dash)).toBe(true);
    expect(has(Sasuke_Q.aiRoles, Role.Cc)).toBe(true);
  });

  it('tells the bot Kage Bunshin puts bodies in the world', () => {
    expect(has(Naruto_W.aiRoles, Role.Summon)).toBe(true);
  });

  it('leaves the abilities inference already reads correctly untagged', () => {
    // Tagging is an improvement to opt into, not a checklist. A ranged
    // DIRECTION skillshot is already read as Damage | Poke | Burst, and
    // restating that by hand is a second copy that can drift.
    expect(Naruto_Q.aiRoles).toBeUndefined();
    expect(Sasuke_W.aiRoles).toBeUndefined();
  });
});
