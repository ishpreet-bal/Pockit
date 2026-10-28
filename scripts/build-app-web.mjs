import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const mobile = join(root, 'mobile');
const output = resolve(root, 'public/app');
const build = spawnSync(process.execPath, [join(mobile, 'node_modules/expo/bin/cli'), 'export', '-p', 'web', '--clear', '--output-dir', output], {
  cwd: mobile,
  stdio: 'inherit',
  // Keep the committed preview on its own site's backend, regardless of mobile/.env.
  env: { ...process.env, EXPO_NO_DOTENV: '1', EXPO_PUBLIC_API_URL: '', EXPO_PUBLIC_PREVIEW: '0' },
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

// Package assets cannot stay in a node_modules directory, which git ignores.
const source = resolve(output, 'assets/node_modules');
const target = resolve(output, 'assets/pkg');
if (!source.startsWith(output + sep) || !target.startsWith(output + sep)) throw new Error('Asset paths must stay inside public/app.');
if (existsSync(source)) renameSync(source, target);
function patchReferences(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) patchReferences(path);
    else if (['.js', '.html', '.json'].includes(extname(path))) {
      const before = readFileSync(path, 'utf8');
      const after = before.replaceAll('assets/node_modules/', 'assets/pkg/');
      if (after !== before) writeFileSync(path, after);
    }
  }
}
patchReferences(output);
console.log('Built public/app with same-origin API requests.');
