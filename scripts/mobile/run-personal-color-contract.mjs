import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-personal-color-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');

const srcRoot = join(repoRoot, 'apps/mobile/src');
const corePath = 'features/personal-color/services/personalColorCore';

const sourcePaths = [
  `${corePath}/contracts.ts`,
  `${corePath}/constants.ts`,
  `${corePath}/colorMath.ts`,
  `${corePath}/axisModel.ts`,
  `${corePath}/toneClassifier.ts`,
  `${corePath}/palette.ts`,
  `${corePath}/engine.ts`,
  `${corePath}/fixtureInventory.ts`,
  `${corePath}/colorLightingGreenlight.ts`,
  `${corePath}/personalColorRepeatability.ts`,
  'features/personal-color/services/personalColorQualityGate.ts',
];
const tests = [
  `${corePath}/colorMath.test.ts`,
  `${corePath}/axisModel.test.ts`,
  `${corePath}/toneClassifier.test.ts`,
  `${corePath}/engine.test.ts`,
  `${corePath}/colorLightingGreenlight.test.ts`,
  `${corePath}/personalColorRepeatability.test.ts`,
  'features/personal-color/services/personalColorQualityGate.test.ts',
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
  ...tests.map(sourcePath => join(srcRoot, sourcePath)),
]);

for (const test of tests) {
  run(process.execPath, [join(outDir, test.replace(/\.ts$/, '.js'))]);
}
