import { buildTestApi, indexObjects, type TestGame } from '@moba2d/core/testing';
import type { AttackableUnit, Champion } from '@moba2d/core/content/types';

const { AttackableUnit: Unit, Champion: TestChampion } = buildTestApi().units;

/**
 * One test body, at full health and chakra.
 *
 * Shared because every spell test here needs the same lines, and because the
 * *defaults* matter to the assertions: a 100 health pool is what core's
 * `docs/VFX_STANDARD.md` scales this pack's damage numbers against, so a test
 * that quietly used 500 would stop being able to tell a tuned ability from an
 * untuned one.
 */
export function unit(game: TestGame, x: number, teamId: string, y = 0): AttackableUnit {
  const created = new Unit({ game, position: createVector(x, y), teamId });
  created.stats.mana.baseValue = 100;
  created.stats.maxMana.baseValue = 100;
  created.stats.health.baseValue = 100;
  created.stats.maxHealth.baseValue = 100;
  return created;
}

/**
 * A real `Champion`, for the two things an `AttackableUnit` cannot stand in
 * for: holding a `spells[]` array, and therefore transforming.
 */
export function champion(game: TestGame, x: number, teamId: string, y = 0): Champion {
  const created = new TestChampion({ game, teamId }) as Champion;
  created.position.set(x, y);
  created.destination.set(x, y);
  created.stats.mana.baseValue = 100;
  created.stats.maxMana.baseValue = 100;
  created.stats.health.baseValue = 100;
  created.stats.maxHealth.baseValue = 100;
  return created;
}

export { indexObjects };
