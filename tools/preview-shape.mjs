/**
 * Draw a spell's geometry to an SVG so you can *look* at it.
 *
 * ## Why this exists
 *
 * Kurama Arms shipped twice looking nothing like an arm, and both times the
 * code typechecked, the tests passed, and nobody could tell until it was in a
 * match. A shape is not something you can review by reading it — "does this
 * read as a hand" is answered by eyes and by nothing else.
 *
 * So the geometry gets copied here, rendered, and looked at, and only then
 * ported into the spell. Three rounds of that turned a tapering noodle with a
 * spiky ball into a limb with an elbow and a hand, and each round cost
 * seconds instead of a reload and a match.
 *
 * ## How to use it
 *
 *   node tools/preview-shape.mjs && magick tools/preview-shape.svg out.png
 *
 * Copy the *geometry* from the spell, not the colours — what is being judged
 * is the shape. Two things this harness cannot do that p5 can, both learned
 * the hard way: ImageMagick ignores the three-argument `rotate(angle cx cy)`
 * and flings the element across the canvas, and it needs a font for `<text>`
 * or it refuses the whole file. Avoid both.
 *
 * What this file currently holds is Sakura's R — the crater her fist leaves —
 * at three moments: the landing, the rubble holding, and the floor sinking
 * back.
 */
import fs from 'node:fs';

const RADIUS = 175;   // the damage radius, and the rubble that slows
const CHUNKS = 14;    // debris rooted ON the rim, not fanned out of the centre
const FISSURES = 7;

/** Seeded per piece so nothing re-rolls its own size every frame. */
const seedOf = (i, salt) => Math.sin(i * 12.9898 + salt * 4.1414) * 0.5 + 0.5;

function stage(cx, cy, out, rubble) {
  const g = [`<g transform="translate(${cx} ${cy})">`];

  // Churned floor, not a hole. The first cut filled this with near-black at
  // 0.7 and it read as a void punched in the map — worse, it swallowed
  // everybody standing in the zone it exists to mark. The standard says to
  // avoid both ends of value for exactly this: the ground is lighter dust,
  // and only the bowl right under the fist is darker than the map.
  g.push(`<circle cx="0" cy="0" r="${(RADIUS * 0.96).toFixed(1)}"
      fill="#c9a86f" fill-opacity="${(0.10 + 0.14 * rubble).toFixed(2)}"/>`);
  g.push(`<circle cx="0" cy="0" r="${(RADIUS * 0.34).toFixed(1)}"
      fill="#3a2c17" fill-opacity="${(0.30 * rubble).toFixed(2)}"/>`);

  // fissures running out of the impact point to the rim — they stop AT the
  // rim, so the longest one is not read as the reach
  for (let f = 0; f < FISSURES; f++) {
    const a = (f / FISSURES) * Math.PI * 2 + seedOf(f, 3) * 0.3;
    const pts = [];
    for (let s = 0; s <= 5; s++) {
      const t = s / 5;
      const wob = Math.sin(t * 6 + f) * 9 * t;
      const r = RADIUS * 0.94 * t;
      pts.push(`${(Math.cos(a) * r - Math.sin(a) * wob).toFixed(1)},${(Math.sin(a) * r + Math.cos(a) * wob).toFixed(1)}`);
    }
    g.push(`<polyline points="${pts.join(' ')}" fill="none"
        stroke="#4a3418" stroke-opacity="${(0.85 * rubble).toFixed(2)}" stroke-width="${(3 + 3 * rubble).toFixed(1)}"/>`);
  }

  // the rubble ring: chunks ROOTED ON the rim circle. Each sits astride the
  // rim rather than radiating from the middle, which is what keeps this a
  // ring of debris instead of a sun.
  for (let c = 0; c < CHUNKS; c++) {
    const a = (c / CHUNKS) * Math.PI * 2 + seedOf(c, 1) * 0.18;
    const seed = seedOf(c, 2);
    const w = 16 + seed * 16;          // along the rim
    const h = (9 + seed * 13) * rubble; // across it
    const ca = Math.cos(a), sa = Math.sin(a);
    const tx = -sa, ty = ca;           // tangent
    const inner = RADIUS - h * 0.55, outer = RADIUS + h * 0.45;
    const v = [
      [ca * inner - tx * w / 2, sa * inner - ty * w / 2],
      [ca * inner + tx * w / 2, sa * inner + ty * w / 2],
      [ca * outer + tx * w * 0.32, sa * outer + ty * w * 0.32],
      [ca * outer - tx * w * 0.38, sa * outer - ty * w * 0.38],
    ];
    g.push(`<polygon points="${v.map(q => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')}"
        fill="#b99a63" fill-opacity="${(0.9 * rubble).toFixed(2)}" stroke="#3b2a14" stroke-width="2"/>`);
  }

  // the rim itself, on the radius the damage really used — the last thing to
  // fade, so the next press is aimed by something true
  g.push(`<circle cx="0" cy="0" r="${RADIUS}" fill="none"
      stroke="#6b4f2a" stroke-opacity="0.95" stroke-width="3.5"/>`);

  // the shockwave: only on the landing frame, expanding past the rim
  if (out > 0 && out < 1) {
    g.push(`<circle cx="0" cy="0" r="${(RADIUS * (0.3 + out * 1.05)).toFixed(1)}" fill="none"
        stroke="#ffe9c9" stroke-opacity="${(1 - out).toFixed(2)}" stroke-width="${(9 * (1 - out)).toFixed(1)}"/>`);
  }

  // her mark at the point of impact: the Byakugo rhombus, which every effect
  // in this kit carries
  const m = 26;
  g.push(`<polygon points="0,${-m} ${m * 0.62},0 0,${m} ${-m * 0.62},0"
      fill="none" stroke="#e46a8c" stroke-opacity="0.95" stroke-width="3"/>`);

  g.push(`</g>`);
  return g.join('\n');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="460" viewBox="0 0 1500 460">
<rect width="1500" height="460" fill="#1b1e24"/>
${stage(260, 230, 0.35, 0.55)}
${stage(760, 230, 0, 1)}
${stage(1260, 230, 0, 0.3)}
</svg>`;

fs.writeFileSync(new URL('./preview-shape.svg', import.meta.url), svg);
console.log('wrote tools/preview-shape.svg — landing, rubble holding, sinking back');
