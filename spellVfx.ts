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
});

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
