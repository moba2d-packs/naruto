/**
 * A bot has to actually press these.
 *
 * Reported from a real match: bots holding Naruto or Sasuke never transformed.
 * They were not blocked — the ultimate was castable, in reach, and scored
 * *positive*. It simply scored **6** while an ordinary Q scored **16**, so the
 * bot picked Q every time Q was up, which is nearly always.
 *
 * The cause is core's `inferRoles` being deliberately conservative: it reads
 * every `SELF` cast as `Buff | Shield` and refuses to guess `Dash` or `Summon`
 * at all, because a wrong guess there makes a bot flee with a gap-closer.
 * `Spell.aiRoles` is the field that exists for exactly this, and core's own
 * docs note that nothing had ever set it.
 *
 * The sweep below is core's, not this pack's — `@moba2d/core/testing/bots`
 * scores every ability in every kit through `BotBrain.scoreSpell` itself, so
 * the rules cannot drift from the numbers the bot uses. Hand-tagging four
 * abilities by eye is what left `Kage Bunshin` scoring *lower* than the
 * inference it replaced; the sweep found that in a second, and nothing that
 * looked at these four spells one at a time ever would have.
 *
 * What stays hand-written underneath is the *content* of the tags: which
 * roles are true of which ability, and which abilities are deliberately left
 * for inference to read.
 */
import { describe, expect, it } from 'vitest';
import { describeBotRoles } from '@moba2d/core/testing/bots';
import { buildTestApi } from '@moba2d/core/testing';
import { data } from '../pack';
import * as spells from '../spells/index';
import Naruto_R from '../spells/Naruto_R';
import Naruto_W from '../spells/Naruto_W';
import Naruto_E from '../spells/Naruto_E';
import Sasuke_R from '../spells/Sasuke_R';
import Sasuke_Q from '../spells/Sasuke_Q';
import Naruto_Q from '../spells/Naruto_Q';
import Sasuke_W from '../spells/Sasuke_W';
import Sakura_W from '../spells/Sakura_W';
import Sakura_R from '../spells/Sakura_R';

/**
 * A form's abilities never appear in `champions[].spells` — they are not
 * choosable, so `pack.ts` keeps them out of the picker — which means nothing
 * else in this build ever looks at them. They are still three of the six
 * things a transformed bot has to choose between, so they are swept here.
 */
const formSpells = (championId: string): string[] =>
  ['Q2', 'W2', 'E2'].map(slot => `${championId}_${slot}`).filter(id => id in spells);

describeBotRoles({
  label: 'naruto — the bot can reach every kit',
  spells,
  champions: (data.champions ?? [])
    .filter(champion => champion.playable)
    .map(champion => ({
      id: champion.id,
      name: champion.name,
      spells: champion.spells ?? [],
      // `Naruto_Q2` off `naruto`, `Sasuke_Q2` off `sasuke`.
      formSpells: formSpells(champion.name.split(' ')[0]),
    })),
  // Empty, and it stays empty: this pack is two champions old and every
  // finding was cheaper to fix than to write down.
  knownDebt: [],
});

const Role = buildTestApi().enums.SpellRole;
const has = (mask: number | undefined, role: number): boolean => ((mask ?? 0) & role) !== 0;

describe('what the tags say', () => {
  it('marks both transforms as something worth pressing in a fight', () => {
    // `Burst` is what lifts them above an ordinary poke ability in the
    // scorer. Without it a transform is filed beside a passive self-buff.
    for (const ultimate of [Naruto_R, Sasuke_R]) {
      expect(has(ultimate.aiRoles, Role.Burst)).toBe(true);
      expect(has(ultimate.aiRoles, Role.Buff)).toBe(true);
    }
  });

  it('does not call either transform a shield, however true that is', () => {
    // Susanoo *is* a shield pool. `Shield` still comes off, because in
    // `scoreSpell` that flag does not mean "this protects me", it means
    // "press this when nearly dead": +20 below half health, −5 above. Tagging
    // it made the shell's best moment the one where Sasuke is already losing
    // — the same panic-button shape the untagged version had.
    expect(has(Sasuke_R.aiRoles, Role.Shield)).toBe(false);
    expect(has(Naruto_R.aiRoles, Role.Shield)).toBe(false);
  });

  it('tells the bot Chidori is a dash', () => {
    // The one core refuses to infer, and the reason it refuses: a bot that
    // thinks its gap-closer is an escape runs *at* whatever is chasing it.
    expect(has(Sasuke_Q.aiRoles, Role.Dash)).toBe(true);
    expect(has(Sasuke_Q.aiRoles, Role.Cc)).toBe(true);
  });

  it('never tags an ability with roles the scorer pays nothing for', () => {
    // `Kage Bunshin` was tagged `Summon | Buff`, and `scoreSpell` has no term
    // for `Summon` at all — so the hand-written tag scored 5 where the
    // inference it replaced scored 10, and tagging the ability made the bot
    // use it *less*. `Damage` is the honest half: the clones attack.
    expect(has(Naruto_W.aiRoles, Role.Summon)).toBe(true);
    expect(has(Naruto_W.aiRoles, Role.Damage)).toBe(true);
  });

  it('calls the two steroids buffs and nothing else', () => {
    // Sage Mode grants attack speed, reach and movement. Inference called it
    // `Buff | Shield`, which is 0 in a fight, so a bot only ever pressed it
    // while running away — the moment those three stats are worth least.
    expect(Naruto_E.aiRoles).toBe(Role.Buff);
  });

  it('tells the bot not to spend the recast that ends a transform', () => {
    // The second cause of "bot never uses R", and the one tagging the roles
    // did nothing for. `BotBrain.cast` presses a `RECAST` ability again as a
    // follow-through — right for every other recast in the game, and exactly
    // backwards here, where the second press is how the form comes *down*.
    // With `recastDelayMs` defaulting to 0 the bot toggled the form off on
    // the next think tick: 100 chakra for one frame.
    //
    // What actually guards the behaviour is core's own
    // `BotBrain.recastToggle.test.ts`, which drives a real brain and checks
    // both branches — an untagged recast must still get its follow-through,
    // or a detonation never detonates. This line pins that these two
    // abilities are the ones that opt out, because nothing else in the pack
    // says so.
    expect(Naruto_R.aiRecastAfterMs).toBe(Infinity);
    expect(Sasuke_R.aiRecastAfterMs).toBe(Infinity);
  });

  it('tells the bot the first heal in the pack is a heal', () => {
    // There is nothing in the *shape* of an ability that says which team it
    // is pointed at, so inference reads a `UNIT` cast as damage. Untagged,
    // this is a nuke the bot spends on whoever is nearest — which for an
    // `'ALLY'` cast means it never resolves anything at all.
    expect(Sakura_W.aiRoles).toBe(Role.Heal);
  });

  it('tells the bot her ultimate is the way in, not the way out', () => {
    // `Dash` is the one core refuses to infer, and this is the reason it
    // refuses: a bot that files its engage as an escape runs *at* whatever is
    // chasing it. All four tags are terms `scoreSpell` actually pays for.
    expect(has(Sakura_R.aiRoles, Role.Dash)).toBe(true);
    expect(has(Sakura_R.aiRoles, Role.Burst)).toBe(true);
    expect(has(Sakura_R.aiRoles, Role.Cc)).toBe(true);
  });

  it('leaves the abilities inference already reads correctly untagged', () => {
    // Tagging is an improvement to opt into, not a checklist. A ranged
    // DIRECTION skillshot is already read as Damage | Poke | Burst, and
    // restating that by hand is a second copy that can drift.
    expect(Naruto_Q.aiRoles).toBeUndefined();
    expect(Sasuke_W.aiRoles).toBeUndefined();
    // Kage Bunshin's recast commands the clones somewhere, which *is* a
    // follow-through — a bot pressing it is the bot using the ability.
    expect(Naruto_W.aiRecastAfterMs).toBeUndefined();
  });
});
