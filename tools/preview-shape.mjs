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
 *   node tools/preview-shape.mjs           # writes the SVG *and* the PNG
 *
 * Copy the *geometry* from the spell, not the colours — what is being judged
 * is the shape.
 *
 * ## It rasterises itself, and that is not a convenience
 *
 * This used to say `magick tools/preview-shape.svg out.png`, and ImageMagick
 * **silently dropped the second `<polyline>` of every overlapping pair**. A
 * shadow drawn as a dark body inside a bright rim came back as bare rims, and
 * two rounds went into "fixing" a colour problem that did not exist — a
 * preview harness that quietly loses layers is worse than no harness at all,
 * because it invents work.
 *
 * `sharp` (already a devDependency, for the art pipeline) renders the same
 * file correctly. Two more things this harness still cannot do that p5 can,
 * both learned the same way: the three-argument `rotate(angle cx cy)` is not
 * portable here, and `<text>` needs a font or the file is refused. Avoid
 * both.
 *
 * What this file currently holds is Shikamaru's shadow: the R web spreading at
 * three moments, and the Q line beside it.
 */
import fs from 'node:fs';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const WEB_REACH = 300;      // how far the furthest tendril reaches
const PRIMARIES = 7;        // tendrils leaving him
const SEGMENTS = 9;

/** Seeded per piece so nothing re-rolls its own wander every frame. */
const seedOf = (i, salt) => Math.sin(i * 12.9898 + salt * 4.1414) * 0.5 + 0.5;

/**
 * One tendril: a wandering polyline, NOT a straight ray.
 *
 * Straight rays leaving a point are a mace, whatever they were meant to be —
 * the failure that turned an arm into a club, a wave into a hedgehog and a
 * grip into a starburst. A shadow crawls: it wanders, it is thin, and it
 * forks, and those three together are what stop five of them at one origin
 * reading as a star.
 */
function tendril(fromX, fromY, angle, length, seed, grow) {
  const pts = [];
  let x = fromX, y = fromY;
  for (let s = 0; s <= SEGMENTS; s++) {
    const t = s / SEGMENTS;
    if (t > grow) break;
    pts.push({ x, y, t });
    // Wander AROUND the tendril's own heading, never a random walk off it.
    // A walk accumulates, so seven tendrils that were meant to go seven ways
    // all drift the same way and pile into one streak — which is what the
    // first render of this did.
    const at = angle + Math.sin(t * 5.5 + seedOf(seed, 2) * 6.28) * 0.42;
    const step = length / SEGMENTS;
    x += Math.cos(at) * step;
    y += Math.sin(at) * step;
  }
  return { pts, x, y };
}

function web(cx, cy, grow) {
  const g = [`<g transform="translate(${cx} ${cy})">`];

  // The reach, drawn whatever the tendrils are doing: the web roots anything
  // a tendril touches, and the tendrils never leave this circle.
  g.push(`<circle cx="0" cy="0" r="${WEB_REACH}" fill="#2a1f3d" fill-opacity="0.16"
      stroke="#8f6ede" stroke-opacity="0.75" stroke-width="3"/>`);

  const strokes = [];
  for (let p = 0; p < PRIMARIES; p++) {
    const angle = (p / PRIMARIES) * Math.PI * 2 + seedOf(p, 1) * 0.5;
    // 0.8, not 0.95: the wander adds arc length, so a tendril written to the
    // full reach ends up outside the circle that is supposed to bound it —
    // and the circle is the rim the damage really uses.
    const main = tendril(0, 0, angle, WEB_REACH * 0.72, p * 7, grow);
    strokes.push({ pts: main.pts, w: 13 });

    // forks, rooted PART WAY ALONG the parent rather than at the hub
    for (let f = 0; f < 2; f++) {
      const at = Math.floor(main.pts.length * (0.35 + f * 0.3));
      const root = main.pts[at];
      if (!root) continue;
      const side = f % 2 === 0 ? 1 : -1;
      const branch = tendril(
        root.x, root.y,
        angle + side * (0.6 + seedOf(p + f, 3) * 0.5),
        WEB_REACH * 0.34, p * 31 + f * 11,
        Math.max(0, (grow - root.t) / Math.max(1 - root.t, 0.001))
      );
      strokes.push({ pts: branch.pts, w: 8 });
    }
  }

  for (const { pts, w } of strokes) {
    if (pts.length < 2) continue;
    const d = pts.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
    // a bright rim UNDER a near-black body: a shadow on a nearly black floor
    // is invisible without one, which Sakura's R already had to learn twice
    // The rim is a HAIRLINE around a wide dark body, not the other way round.
    // First render made the rim nearly as wide as the body and the whole web
    // read as violet worms — the shadow has to be the thing you see, and the
    // rim only exists so it is not invisible on a nearly black floor.
    g.push(`<polyline points="${d}" fill="none" stroke="#a184f0" stroke-opacity="0.95"
        stroke-width="${w + 5}" stroke-linecap="round" stroke-linejoin="round"/>`);
    g.push(`<polyline points="${d}" fill="none" stroke="#0b0810"
        stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  g.push(`<circle cx="0" cy="0" r="20" fill="none" stroke="#7bd1a0" stroke-width="3"/>`);
  g.push(`</g>`);
  return g.join('\n');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="700" viewBox="0 0 1500 700">
<rect width="1500" height="700" fill="#1b1e24"/>
${web(330, 350, 0.35)}
${web(830, 350, 0.7)}
${web(1330, 350, 1)}
</svg>`;

const svgPath = new URL('./preview-shape.svg', import.meta.url);
const pngPath = new URL('./preview-shape.png', import.meta.url);
fs.writeFileSync(svgPath, svg);
await sharp(Buffer.from(svg)).png().toFile(fileURLToPath(pngPath));
console.log('wrote tools/preview-shape.svg + .png — the shadow web at a third, two thirds, full');
