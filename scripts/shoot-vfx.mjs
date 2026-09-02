/**
 * Photograph this pack's abilities in the real renderer.
 *
 * ## Why a pack needs this at all
 *
 * `npm run verify` cannot see whether an effect is legible, and no unit test
 * ever will. Everything this pack got wrong visually was found by a player in
 * a match, one report at a time:
 *
 *   "đột nhiên xuất hiện rồi đột nhiên biến mất gây damage"
 *   "instant quá, ko có animation gì bay từ Gaara tới kẻ địch"
 *   "E giống Trundle với Anivia quá"
 *   "ko render quay theo hướng đang bay"
 *
 * `tests/vfxRules.test.ts` now closes the ones a scan can hold. This closes
 * the rest the only way they can be closed: run the ability and look at it.
 * The rotation bug in particular was **invisible in every other way** — it
 * typechecked, it passed its tests, and it drew every wave pointing east.
 *
 * ## What it actually does
 *
 * Core owns the rig (`tests/e2e/shoot-new-champion-vfx.mjs`): it boots core's
 * dev server, starts a match, clears the arena, stands a punching bag in
 * front of the player and screenshots each cast at a few frames straddling
 * the moments the effect *changes*. A single frame cannot tell an animation
 * from a pop-in, which is the whole reason it samples several.
 *
 * This script is the thin half a pack owns: find the linked core, hand it
 * `tests/e2e/vfx-casts.json`, and get out of the way.
 *
 *   npm run e2e:vfx                    # every ability on the sheet
 *   npm run e2e:vfx -- /tmp/out Gaara  # one champion, into a chosen folder
 *
 * Then open **one or two** of the PNGs. A 1280x900 screenshot costs about
 * what 600 lines of source costs to read; trust the script's PASS/FAIL lines
 * for "did it fire", and spend the frames on judging the look.
 *
 * ## Why it needs the dev link, and why that is not a limitation
 *
 * The rig runs core's own Vite server, so it needs core's **source**, not the
 * published tarball — which means `npm run pack:link -- ../naruto` from a
 * core checkout beside this one. That is the same link `npm run dev` needs to
 * see this pack's champions at all, so anybody in a position to look at their
 * own VFX already has it. It is deliberately **not** in `verify`: it wants a
 * real Chrome and real minutes, and `verify` runs on every push.
 */
import { existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const linked = join(packRoot, 'node_modules/@moba2d/core');

if (!existsSync(linked)) {
  console.error('\n  @moba2d/core is not installed. Run `npm install` first.\n');
  process.exit(1);
}

// The symlink's target is the core checkout; a plain directory here is the
// tarball npm fetched, which has no `tests/` and no dev server to start.
const coreRoot = realpathSync(linked);
const rig = join(coreRoot, 'tests/e2e/shoot-new-champion-vfx.mjs');

if (!existsSync(rig)) {
  console.error(
    `\n  This needs a *linked* core checkout, not the published package.\n` +
      `  Resolved @moba2d/core to:\n    ${coreRoot}\n` +
      `  which has no tests/e2e/. From a core checkout beside this one:\n\n` +
      `    npm run pack:link -- ${packRoot}\n\n` +
      `  (That is the same link \`npm run dev\` needs to see this pack at all.)\n`
  );
  process.exit(1);
}

const sheet = join(packRoot, 'tests/e2e/vfx-casts.json');
const [outDir = '/tmp/moba2d-naruto-vfx', only] = process.argv.slice(2);

console.log(`shooting ${only ? `"${only}"` : 'the whole sheet'} into ${outDir}`);
console.log(`  core: ${coreRoot}`);

const result = spawnSync('node', [rig, outDir, ...(only ? [only] : [])], {
  cwd: coreRoot,
  stdio: 'inherit',
  env: { ...process.env, MOBA2D_VFX_CASTS: sheet },
});

process.exit(result.status ?? 1);
