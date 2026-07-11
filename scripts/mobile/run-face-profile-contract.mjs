import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-face-profile-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const srcRoot = join(repoRoot, 'apps/mobile/src');

const sourcePaths = [
  'shared/types/faceProfile.ts',
  'shared/contracts/faceAnalysisQuality.ts',
  'features/face-profile/constants/faceShapeLandmarks.ts',
  'features/face-profile/services/faceProfileContract.ts',
  'features/face-profile/services/faceProfileContract.test.ts',
];

function run(command, args) {
  const result = spawnSync(command, args, {cwd: repoRoot, stdio: 'inherit'});
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [
  tscPath,
  '--ignoreConfig',
  '--module',
  'commonjs',
  '--target',
  'ES2020',
  '--esModuleInterop',
  '--strict',
  '--skipLibCheck',
  '--rootDir',
  srcRoot,
  '--outDir',
  outDir,
  ...sourcePaths.map(sourcePath => join(srcRoot, sourcePath)),
]);

run(process.execPath, [
  join(outDir, 'features/face-profile/services/faceProfileContract.test.js'),
]);
