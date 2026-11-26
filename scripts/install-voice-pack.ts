/**
 * Installs the recorded Saudi voice pack so the site ships it.
 *
 *   npm run voice:install -- path/to/darbak-voice-ar.zip [--require-complete] [--public <dir>]
 *
 * The zip is the file "Save the pack (ZIP)" produces in the Voice Studio
 * (open the site, Settings, Voice studio). The clips are copied to
 * public/voice/<locale>/; commit them and the next deploy plays them for
 * everyone, with the device voice as the fallback for anything not recorded.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { installPack } from './voicePack';

const args = process.argv.slice(2);
const complete = args.includes('--require-complete');
const publicFlag = args.indexOf('--public');
const publicDir = resolve(publicFlag >= 0 ? (args[publicFlag + 1] ?? 'public') : 'public');
const file = args.find((arg, i) => !arg.startsWith('--') && i !== publicFlag + 1);

if (!file) {
  console.error('Usage: npm run voice:install -- <darbak-voice-xx.zip> [--require-complete]');
  process.exit(2);
}

try {
  const report = await installPack(new Uint8Array(await readFile(file)), publicDir);
  const mb = (report.bytes / 1_048_576).toFixed(1);
  console.log(`Installed ${report.installed} clips (${mb} MB) into public/voice/${report.locale}/`);
  console.log(`Phrases recorded: ${report.atomsDone} of ${report.atomsTotal}`);
  console.log(
    `Routes spoken entirely in this voice: ${report.routesFull} of ${report.routesTotal}` +
      ` (${Math.floor((report.routesFull / report.routesTotal) * 100)}%)`,
  );
  if (report.rejected.length > 0) {
    console.warn(`\nLeft out (${report.rejected.length}):`);
    report.rejected.forEach((line) => console.warn(`  - ${line}`));
  }
  if (report.atomsDone < report.atomsTotal) {
    console.log(`\nStill to record, for example: ${report.missing.join(' | ')}`);
    console.log('Anything not recorded is read by the device voice, so the app keeps working.');
    if (complete) process.exit(1);
  }
} catch (error) {
  console.error(`Could not install the pack: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
