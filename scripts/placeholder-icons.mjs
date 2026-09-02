/**
 * Draws a stand-in icon for any ability that has no artwork yet.
 *
 * ## Why this exists at all
 *
 * An ability with no icon is not an ability that looks plain — it is an
 * ability that **is not in the spell bar**. `hudState.ts`'s `buildSpells`
 * filters on `i?.image?.path`, so a spell with no image is dropped from the
 * row entirely: it still casts on its hotkey, and the player has no way to
 * see it exists, what it costs, or whether it is off cooldown. That is a
 * silent failure of exactly the kind this repository turns into loud ones
 * everywhere else, and it cost a real match to notice.
 *
 * So while the real icons are being drawn, every ability gets *something*.
 *
 * ## It never overwrites
 *
 * A file already in `assets/images/spells/` is left exactly as it is. That is
 * the whole workflow: drop the finished icons in as they arrive, re-run this,
 * and it fills only the gaps that are left. Which also means deleting a
 * placeholder is how you ask for it to be redrawn.
 *
 * Run `npm run art:import` afterwards — the icons are on the provenance
 * ledger like everything else, so their hashes have to be re-recorded or
 * `art:check` will (correctly) say the art and the ledger disagree.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'assets/images/spells');
const SIZE = 128;

/**
 * `id` is the spell id lowercased, which is what makes the asset key: the
 * generator maps `assets/images/spells/naruto_q.png` to `spell_naruto_q`.
 * `label` is what the tile says, `tint` is its colour — grouped by champion so
 * a bar reads as one kit rather than four unrelated buttons.
 */
export const PLACEHOLDERS = [
  { id: 'naruto_q', label: 'RS', tint: ['#2f6fd0', '#8fc4ff'] },
  { id: 'naruto_w', label: 'KB', tint: ['#c8641c', '#ffc07a'] },
  { id: 'naruto_e', label: 'SM', tint: ['#b8860b', '#ffe08a'] },
  { id: 'naruto_r', label: 'KU', tint: ['#a8321a', '#ffb257'] },
  { id: 'naruto_q2', label: 'BR', tint: ['#8c2a12', '#ff9a4d'] },
  { id: 'naruto_w2', label: 'KA', tint: ['#9a6b12', '#ffd479'] },
  { id: 'naruto_e2', label: 'BD', tint: ['#3b1461', '#c79bff'] },

  { id: 'sasuke_q', label: 'CH', tint: ['#1d4f8c', '#93d0ff'] },
  { id: 'sasuke_w', label: 'GK', tint: ['#a33a12', '#ffab6b'] },
  { id: 'sasuke_e', label: 'SH', tint: ['#8c1220', '#ff8a94'] },
  { id: 'sasuke_r', label: 'SU', tint: ['#4a2585', '#c9a4ff'] },
  { id: 'sasuke_q2', label: 'YM', tint: ['#5a2a9c', '#d3b0ff'] },
  { id: 'sasuke_w2', label: 'AM', tint: ['#1a1420', '#7a6a86'] },
  { id: 'sasuke_e2', label: 'IA', tint: ['#3a2f8c', '#a8b6ff'] },

  { id: 'gaara_q', label: 'SS', tint: ['#8a6a2c', '#e6c98a'] },
  { id: 'gaara_w', label: 'ST', tint: ['#6d5220', '#d8b877'] },
  { id: 'gaara_e', label: 'SB', tint: ['#5a431a', '#c9a868'] },
  { id: 'gaara_r', label: 'SO', tint: ['#4a3714', '#b89457'] },
];

/**
 * A dark tile, a tinted disc and the label. Deliberately plain and
 * deliberately *not* pretty: a placeholder that looked finished is one nobody
 * remembers to replace.
 */
const tile = (label, [deep, bright]) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs>
    <radialGradient id="g" cx="50%" cy="42%" r="62%">
      <stop offset="0%" stop-color="${bright}"/>
      <stop offset="100%" stop-color="${deep}"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="#12141a"/>
  <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE * 0.36}" fill="url(#g)"/>
  <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE * 0.36}" fill="none"
          stroke="${bright}" stroke-opacity="0.85" stroke-width="3"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="Helvetica, Arial, sans-serif" font-size="${SIZE * 0.3}"
        font-weight="700" fill="#0d0f14" fill-opacity="0.85">${label}</text>
</svg>`;

mkdirSync(OUT, { recursive: true });
let drawn = 0;
let kept = 0;
for (const { id, label, tint } of PLACEHOLDERS) {
  const path = join(OUT, `${id}.png`);
  if (existsSync(path)) {
    kept++;
    continue;
  }
  const png = await sharp(Buffer.from(tile(label, tint))).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(path, png);
  drawn++;
}
console.log(
  `placeholder icons: ${drawn} drawn, ${kept} real icon(s) left alone` +
    (drawn > 0 ? '\n  run `npm run art:import` to re-record the ledger' : '')
);
