/**
 * Fetches this pack's champion portraits from the Naruto wiki, and records
 * where every byte came from.
 *
 * **This is a pack, so third-party art belongs here.** Core carries none — it
 * draws every pixel it ships, which is what keeps the engine installable and
 * redistributable on its own. A player installing a Naruto pack is told what
 * it contains; see `README.md`.
 *
 * ## Why the titles are written down and not derived
 *
 * The obvious route is `prop=pageimages`, which hands back whatever image an
 * article's infobox happens to use. It was measured on all twelve and it is
 * not good enough: it returns the **Part I (child)** portrait for Naruto,
 * Sasuke and Sakura — odd for a roster whose ultimates are Kurama Mode and a
 * Perfect Susanoo — and white-background *game render* sheets for Zabuza,
 * Haku, Itachi and Deidara, whose faces then land a few dozen pixels tall
 * inside a full-body crop.
 *
 * So `ROSTER` names a file per champion, the same way the Dota pack's own
 * importer writes down Valve's hero slug rather than deriving it. `slug` is
 * the wiki's file title; `local` is what this pack calls the file, and
 * therefore half of its asset key — `assets/images/champions/naruto.png` is
 * `champ_naruto`, which is the string `pack.ts` writes.
 *
 * ## Why the ability icons are not here
 *
 * They cannot come from this wiki. Its jutsu images are 1920x1080 cinematic
 * frames, and an ability icon is a 128px square: centre-cropping one gives
 * you whatever was in the middle of that shot, which was measured as a black
 * smudge for Amaterasu and an orange smudge for Susanoo — three of four
 * unusable. The icons are generated instead, from the prompt sheet at the
 * repository root, and dropped into `assets/images/spells/` by hand. They
 * still get a `source-manifest.json` row, with no `sourceUrl`, exactly as the
 * Dota pack records its locally-supplied shelf logo.
 *
 * `--check` re-hashes what is on disk against the manifest and touches the
 * network for nothing. That is what `verify` runs, so a build on a machine
 * with no internet still fails loudly when the committed art and the recorded
 * provenance have drifted apart — rather than silently re-fetching and turning
 * "which art changed" into a diff of binary blobs.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(root, 'assets/source-manifest.json');
const WIKI = 'https://naruto.fandom.com/api.php';
const UA = 'moba2d-content-naruto art importer (+https://github.com/moba2d-packs/naruto)';

/** Portrait edge, in pixels. Matches the Dota pack's, and the roster row is square. */
const PORTRAIT = 256;

export const ROSTER = [
  // Konoha
  { slug: 'Naruto Part II.png', local: 'naruto' },
  { slug: 'Sasuke Part 2.png', local: 'sasuke' },
  { slug: 'Kakashi Hatake.png', local: 'kakashi' },
  { slug: 'Sakura Part 1.png', local: 'sakura' },
  { slug: 'Neji Part I.png', local: 'neji' },
  { slug: 'Shikamaru Part I.png', local: 'shikamaru' },
  // Suna
  { slug: 'Gaara in Part I.png', local: 'gaara' },
  { slug: 'Temari newshot.png', local: 'temari' },
  // Kiri
  { slug: 'Zabuza Momochi.png', local: 'zabuza' },
  { slug: 'Haku.png', local: 'haku' },
  // Akatsuki
  { slug: 'Itachi Akatsuki Mobile.png', local: 'itachi' },
  { slug: 'Deidara - Akatsuki.png', local: 'deidara' },

  // Transformed portraits. A champion's avatar is a plain field, so a stance
  // can swap it — and it has to: an enemy needs to read "he is in the form"
  // off the body and the scoreboard, not off a buff icon they are not
  // looking at. One extra row here per transforming champion.
  // `zoom` because this one is a full-body render 2700x3600: the generic
  // rule below takes a square off the top, which on a standing figure is
  // still the whole figure and leaves the head a dozen pixels tall. 0.55
  // takes a narrower slice so the avatar reads as a face.
  { slug: "Naruto's Kurama Mode.png", local: 'naruto_kurama', zoom: 0.55 },
];

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

async function download(url) {
  const response = await fetch(url, { headers: { 'user-agent': UA } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Resolves wiki file titles to real URLs. The CDN path carries a content-hash
 * directory (`/7/7d/`) nobody can guess, so a title is the only stable handle
 * — and resolving by title means a re-upload on the wiki is picked up rather
 * than 404ing.
 */
async function resolveWikiUrls(titles) {
  const out = new Map();
  // The API caps a titles batch; fifty is well inside it and this roster is
  // twelve, but the loop is here so a growing roster does not silently
  // truncate at whatever the cap turns out to be.
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const query = new URLSearchParams({
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'url',
      format: 'json',
      titles: batch.map(title => `File:${title}`).join('|'),
    });
    const response = await fetch(`${WIKI}?${query}`, { headers: { 'user-agent': UA } });
    if (!response.ok) throw new Error(`wiki api: ${response.status} ${response.statusText}`);
    const body = await response.json();
    for (const page of Object.values(body.query?.pages ?? {})) {
      const url = page.imageinfo?.[0]?.url;
      if (url) out.set(page.title.replace(/^File:/, ''), url.split('/revision/')[0]);
    }
  }
  return out;
}

/**
 * Square, without squashing, and cropped to where the face actually is.
 *
 * The wiki's portraits come in two shapes and one rule does not serve both. An
 * anime screenshot is wider than tall and the subject is centred, so `centre`
 * is right. A game-render sheet is *taller* than wide and is a whole standing
 * body — a centred crop of one lands on the waist. Measured on this roster:
 * Deidara is 769x1666 and Itachi 368x854, and both only read as faces when
 * taken from the top.
 */
const square = async (buffer, zoom) => {
  const { width = 1, height = 1 } = await sharp(buffer).metadata();

  // `zoom` cuts a narrower square off the top before the fit runs, for the
  // full-body renders where "the top square" is still a whole standing
  // person. Centred horizontally because that is where a posed figure's head
  // is; taken from the very top because that is where a head is vertically.
  if (zoom && zoom > 0 && zoom < 1) {
    const side = Math.round(Math.min(width, height) * zoom);
    return sharp(buffer)
      .extract({ left: Math.round((width - side) / 2), top: 0, width: side, height: side })
      .resize(PORTRAIT, PORTRAIT, { fit: 'cover', position: 'centre' })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  const position = height > width ? 'top' : 'centre';
  return sharp(buffer)
    .resize(PORTRAIT, PORTRAIT, { fit: 'cover', position })
    .png({ compressionLevel: 9 })
    .toBuffer();
};

/**
 * Icons are dropped in by hand (see this file's header). Whatever is sitting
 * in the folder is hashed and recorded, so `art:check` covers them exactly as
 * it covers a fetched portrait — the ledger's job is "this file is what it
 * says it is", and a locally-supplied file needs that as much as a fetched
 * one. It simply has no `sourceUrl`.
 */
function localSpellIcons() {
  const dir = join(root, 'assets/images/spells');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith('.png'))
    .sort()
    .map(name => ({
      localPath: `assets/images/spells/${name}`,
      localAssetKey: `spell_${name.replace(/\.png$/, '')}`,
      note: 'Ability icon, generated for this pack from the prompt sheet.',
    }));
}

const check = process.argv.includes('--check');

async function main() {
  const records = [];

  if (check) {
    if (!existsSync(MANIFEST)) {
      console.error('\n  assets/source-manifest.json missing — run `npm run art:import`.\n');
      process.exit(1);
    }
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    let bad = 0;
    for (const source of manifest.sources) {
      const path = join(root, source.localPath);
      if (!existsSync(path)) {
        console.error(`  missing: ${source.localPath}`);
        bad++;
        continue;
      }
      const hash = sha256(readFileSync(path));
      if (hash !== source.contentHash) {
        console.error(`  changed: ${source.localPath}`);
        bad++;
      }
    }
    if (bad > 0) {
      console.error(`\n  ${bad} file(s) drifted from assets/source-manifest.json.\n`);
      process.exit(1);
    }
    console.log(`art ok: ${manifest.sources.length} file(s) match source-manifest.json`);
    return;
  }

  const urls = await resolveWikiUrls(ROSTER.map(entry => entry.slug));
  const missing = ROSTER.filter(entry => !urls.has(entry.slug));
  if (missing.length > 0) {
    console.error(
      `\n  the wiki has no file for: ${missing.map(e => e.slug).join(', ')}\n` +
        `  (a title was renamed — fix ROSTER rather than guessing a CDN path)\n`
    );
    process.exit(1);
  }

  mkdirSync(join(root, 'assets/images/champions'), { recursive: true });
  for (const entry of ROSTER) {
    const sourceUrl = urls.get(entry.slug);
    const raw = await download(sourceUrl);
    const png = await square(raw, entry.zoom);
    const localPath = `assets/images/champions/${entry.local}.png`;
    writeFileSync(join(root, localPath), png);
    records.push({
      contentHash: sha256(png),
      fetchedAt: new Date().toISOString(),
      localAssetKey: `champ_${entry.local}`,
      localPath,
      sourceHash: sha256(raw),
      sourceUrl,
    });
    console.log(`  ${entry.local.padEnd(12)} <- ${entry.slug}`);
  }

  for (const icon of localSpellIcons()) {
    records.push({
      contentHash: sha256(readFileSync(join(root, icon.localPath))),
      fetchedAt: new Date().toISOString(),
      localAssetKey: icon.localAssetKey,
      localPath: icon.localPath,
      note: icon.note,
    });
  }

  writeFileSync(
    MANIFEST,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        note:
          'Naruto art. Naruto and all related characters and artwork are the property of ' +
          'Masashi Kishimoto, Shueisha and their licensors; this pack is an unofficial, ' +
          'non-commercial fan project and claims no ownership of them. See README.md.',
        sources: records.sort((a, b) => a.localPath.localeCompare(b.localPath)),
      },
      null,
      2
    )}\n`
  );
  console.log(`\nart: ${records.length} file(s) recorded in assets/source-manifest.json`);
}

main().catch(error => {
  console.error(`\n  ${error.message}\n`);
  process.exit(1);
});
