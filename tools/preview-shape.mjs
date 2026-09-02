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
 * What this file currently holds is Temari's wind: the Q crescent in flight on
 * the top row, and the R funnel travelling on the bottom.
 */
import fs from 'node:fs';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const seedOf = (i, salt) => Math.sin(i * 12.9898 + salt * 4.1414) * 0.5 + 0.5;

/**
 * The cutting gust: nested crescents, widest at the front, with streamlines
 * trailing behind them.
 *
 * Wind is the one motif in this pack with no *body* — it is not sand, stone
 * or shadow, it is the shape of moving air. So it is all edges: several
 * curved lines at different radii, all bowing the same way, and the space
 * between them is the effect.
 */
function crescent(cx, cy, halfWidth, bow, weight, colour, alpha) {
  const pts = [];
  for (let s = 0; s <= 14; s++) {
    const t = s / 14;
    const y = -halfWidth + t * halfWidth * 2;
    const x = bow * (1 - Math.pow((y / halfWidth), 2));
    pts.push(`${(cx + x).toFixed(1)},${(cy + y).toFixed(1)}`);
  }
  return `<polyline points="${pts.join(' ')}" fill="none" stroke="${colour}"
      stroke-opacity="${alpha}" stroke-width="${weight}" stroke-linecap="round"/>`;
}

function gust(cx, cy, travel) {
  const g = [`<g transform="translate(${cx} ${cy})">`];
  const width = 74;
  // The blade itself: three crescents, the front one hardest.
  for (let layer = 0; layer < 3; layer++) {
    const back = layer * 16;
    g.push(crescent(-back, 0, width - layer * 6, 34 - layer * 8, 7 - layer * 2,
      layer === 0 ? '#e9fbff' : '#8fd8ef', (0.95 - layer * 0.28).toFixed(2)));
  }
  // Streamlines: the air it has already gone through, all pointing the way
  // it went. Rooted along the crescent, never fanned from a hub.
  for (let line = 0; line < 9; line++) {
    const y = -width + (line / 8) * width * 2;
    const len = 34 + seedOf(line, 1) * 52;
    const lag = 20 + seedOf(line, 2) * 26;
    g.push(`<line x1="${-lag}" y1="${y.toFixed(1)}" x2="${(-lag - len).toFixed(1)}" y2="${(y * 1.06).toFixed(1)}"
        stroke="#8fd8ef" stroke-opacity="0.5" stroke-width="2.5" stroke-linecap="round"/>`);
  }
  g.push(`</g>`);
  // how far it has flown, for scale
  g.push(`<line x1="${cx - travel}" y1="${cy + 120}" x2="${cx}" y2="${cy + 120}"
      stroke="#3b4250" stroke-width="2" stroke-dasharray="6 6"/>`);
  return g.join('\n');
}

/**
 * The funnel: concentric ellipses climbing, plus a spiral. Never radial
 * spokes — spokes from a centre are the mace this repository has drawn three
 * times by accident.
 */
function funnel(cx, cy, radius, spin) {
  const g = [`<g transform="translate(${cx} ${cy})">`];
  g.push(`<circle cx="0" cy="0" r="${radius}" fill="#8fd8ef" fill-opacity="0.07"
      stroke="#8fd8ef" stroke-opacity="0.8" stroke-width="3"/>`);
  // the spiral, drawn as one long polyline winding inward
  const pts = [];
  for (let s = 0; s <= 120; s++) {
    const t = s / 120;
    const a = spin + t * Math.PI * 5.5;
    const r = radius * (1 - t * 0.86);
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r * 0.82).toFixed(1)}`);
  }
  g.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="#cdeffb"
      stroke-opacity="0.85" stroke-width="4" stroke-linecap="round"/>`);
  // rings at three heights, squashed, so it reads as a column seen from above
  for (let ring = 0; ring < 3; ring++) {
    const r = radius * (0.4 + ring * 0.28);
    g.push(`<ellipse cx="0" cy="${(-ring * 9).toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 0.8).toFixed(1)}"
        fill="none" stroke="#e9fbff" stroke-opacity="${(0.7 - ring * 0.18).toFixed(2)}" stroke-width="2.5"/>`);
  }
  g.push(`</g>`);
  return g.join('\n');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="760" viewBox="0 0 1500 760">
<rect width="1500" height="760" fill="#1b1e24"/>
${gust(330, 190, 120)}
${gust(830, 190, 300)}
${gust(1330, 190, 480)}
${funnel(330, 560, 96, 0)}
${funnel(830, 560, 96, 1.9)}
${funnel(1330, 560, 96, 3.8)}
</svg>`;

const svgPath = new URL('./preview-shape.svg', import.meta.url);
const pngPath = new URL('./preview-shape.png', import.meta.url);
fs.writeFileSync(svgPath, svg);
await sharp(Buffer.from(svg)).png().toFile(fileURLToPath(pngPath));
console.log('wrote tools/preview-shape.svg + .png — the gust in flight, and the funnel turning');
