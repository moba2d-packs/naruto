import { api } from './packApi';

/**
 * The pack's shared visual vocabulary.
 *
 * Every rule here comes from core's `docs/VFX_STANDARD.md`, and every one of
 * them was written down here because the first cut of this pack broke it. The
 * abilities shipped as flat circles that crossed the screen in a third of a
 * second, spawned nothing when they landed, and left no trail — the report
 * from a real match was "vừa nhanh, vừa khó nhìn, không có gì đặc biệt", which
 * is precisely what the standard predicts when you skip it.
 *
 * Shared rather than copied into each spell because the standard's first rule
 * is that a champion's effects must be recognisably *one kit*. Duplicated
 * drawing code is how a kit drifts into four unrelated buttons.
 */

/**
 * The range band this pack tunes against, and why it is written down.
 *
 * Core's `docs/VFX_STANDARD.md` states it — *"skillshots 350–500"*, scaled to
 * the canvas rather than to a PC game's wiki values — and this pack shipped
 * its first kit at 520/640/760/900 anyway. In a match that reads as a
 * champion who never has to approach anybody, which is not what a melee
 * bruiser is; reported simply as "sao tầm xa dữ vậy".
 *
 * Measured against the packs that already exist: the Dota pack's ordinary
 * skillshots sit at 380–520 and its ultimates at 300–650, and the reference
 * pack's Q is 420. So an ordinary ability here belongs near 430, a
 * form-upgraded one near 500, a grab may stretch to ~560 because reaching is
 * the whole ability, and only the heaviest ultimate line earns 650.
 */
export const RANGE_BAND = Object.freeze({
  ABILITY: 430,
  UPGRADED: 500,
  GRAB: 560,
  ULTIMATE_LINE: 650,

  /**
   * How far a *placed* structure may be put from the caster.
   *
   * Deliberately the shortest reach in the pack and deliberately its own slot
   * rather than a share of `ABILITY`: a wall dropped at skillshot range is a
   * tool for cutting off a fight somebody else is having, which is a
   * different — and much stronger — ability than one that shapes the ground
   * around its own caster. Short enough that placing it means committing to
   * where he is standing.
   */
  PLACED: 300,

});

/**
 * How far a landed effect lights the fog for its team.
 *
 * Core already does the work: `FogOfWar` reads `visionRadius` off *any*
 * object, not only units (`fogRevealOf`), and casts the same wall-aware
 * polygon it casts for a champion. So a spell object grants sight by carrying
 * a number, and nothing else has to happen — no ward, no buff, no timer. The
 * effect's **own lifetime is the window**, which is why none of these come
 * with a duration: a bolt that fades in half a second shows you half a
 * second, and a fire that burns for three shows you three.
 *
 * Stated here rather than per spell for `RANGE_BAND`'s reason — the numbers
 * have to be comparable across a roster, and the second author to want one
 * should find the band instead of inventing a 900.
 *
 * The rule behind the four: **you see about as far as you hit, plus enough to
 * read the answer.** Vision is the strongest thing a spell can quietly hand
 * out — a ranged ability that lights a jungle is a scouting tool whatever its
 * damage says — so an ability that lands *on* someone sees less than one that
 * puts a burning circle on the ground and stands it there.
 */
export const SIGHT = Object.freeze({
  /** A hit landed: look at what you hit, and whether to follow it. */
  IMPACT: 250,
  /** An ultimate-scale detonation, which is a bigger hole in the dark. */
  BLAST: 320,
  /** A placed effect that stays: it holds the ground it is burning. */
  ZONE: 300,
  /** A victim marked well enough to give their own position away. */
  MARK: 200,
});

/**
 * One ability's chakra, as four related colours.
 *
 * Charging and throwing are the same chakra at two moments, so they cannot be
 * two palettes. They were: `Naruto_Q_Charge` was written for the Rasengan and
 * then reused for the form's two abilities without being told what it was
 * holding, so a player charged a blue sphere and threw an orange one. Reported
 * exactly that way — "expect màu phải trùng lúc charge và lúc release".
 *
 * A `ChargePalette` is what a spell hands *both* halves, so the two cannot
 * disagree: `chargeTint` paints the orb and `rgba(palette.glow, …)` paints the
 * trail, from the same four numbers.
 *
 * The charge ring is deliberately **not** in here. It is the one mark on the
 * sphere that is information rather than chakra — how full the hold is — and
 * it stays the same gold on every ability so a player reads it without
 * relearning it per champion.
 */
export interface ChargePalette {
  /** The motes streaming inward. Brightest of the four. */
  mote: readonly [number, number, number];
  /** The outer glow, and the trail the thrown object leaves. */
  glow: readonly [number, number, number];
  /** The body of the sphere. */
  body: readonly [number, number, number];
  /** The hot centre, and the counter-turning shells. Nearly white. */
  core: readonly [number, number, number];
}

/**
 * The three chakras this pack charges, and the only place their numbers live.
 *
 * Named here rather than in each spell so the family reads as a family: the
 * form's abilities are recognisably the base ability's chakra pushed further,
 * which is the whole visual argument for entering the form.
 */
export const RASENGAN_BLUE: ChargePalette = {
  mote: [150, 210, 255],
  glow: [120, 190, 255],
  body: [125, 200, 255],
  core: [238, 250, 255],
};

/** Kurama's chakra: the same sphere, burning. */
export const BIJUU_ORANGE: ChargePalette = {
  mote: [255, 190, 110],
  glow: [255, 150, 60],
  body: [255, 175, 90],
  core: [255, 246, 225],
};

/** A tailed-beast bomb, which is the heaviest thing either champion throws. */
export const BIJUUDAMA_VIOLET: ChargePalette = {
  mote: [200, 150, 255],
  glow: [150, 90, 220],
  body: [175, 120, 240],
  core: [245, 235, 255],
};

/** `rgba(...)` from a palette entry, so a trail and an orb quote one source. */
export const rgba = (colour: readonly [number, number, number], alpha: number): string =>
  `rgba(${colour[0]}, ${colour[1]}, ${colour[2]}, ${alpha})`;

/** A missile's trail. Length and fade scale with the missile, not with taste. */
export const chakraTrail = (
  owner: { game: unknown; position: p5.Vector; teamId: string },
  colour: string,
  size: number
) =>
  new api.helpers.TrailSystem({
    owner: owner as never,
    trailColor: colour,
    trailSize: size,
    // Long enough to read as motion at a glance, short enough that two
    // missiles in flight do not paint over the fight between them.
    maxLength: 18,
    trailLifeTime: 420,
  });

/**
 * The burst a hit leaves **on the victim**.
 *
 * The standard's third rule, and the one the first cut missed entirely: an
 * impact has to appear where the hit landed, on the unit that took it, or the
 * player has no way to tell a connect from a miss. Seeded here at the moment
 * of impact rather than in `draw()`, because `random()` inside a draw call
 * re-rolls every frame and flickers instead of animating.
 */
export const impactBurst = (
  system: ReturnType<typeof api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize>,
  at: { x: number; y: number },
  count: number,
  spread: number,
  radius: number
): void => {
  for (let grain = 0; grain < count; grain++) {
    const angle = (grain / count) * Math.PI * 2 + Math.random() * 0.5;
    const distance = Math.random() * spread;
    system.addParticle({
      x: at.x + Math.cos(angle) * distance,
      y: at.y + Math.sin(angle) * distance,
      r: radius * (0.55 + Math.random() * 0.45),
    });
  }
};

/**
 * `1 - (1-t)³` — a snap-out. Fast at the start, settling at the end.
 *
 * Named rather than inlined because the standard is explicit that linear
 * interpolation is what makes an effect look like a placeholder, and a named
 * curve is one somebody can reuse instead of writing `t` and moving on.
 */
export const snapOut = (t: number): number => 1 - Math.pow(1 - t, 3);

/** `t²` — a wind-in. Slow to start, rushing at the end. For charges and pulls. */
export const windIn = (t: number): number => t * t;

/** Clamps a normalized progress, so a late frame cannot overshoot an ease. */
export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
