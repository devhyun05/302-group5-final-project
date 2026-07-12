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
  'features/face-profile/services/faceProfileMath.ts',
  'features/face-profile/services/faceProfileMath.test.ts',
  'features/face-profile/services/faceProfileGeometry.ts',
  'features/face-profile/services/faceProfileGeometry.test.ts',
  'features/face-profile/services/faceProfileQualityGate.ts',
  'features/face-profile/services/faceProfileQualityGate.test.ts',
  'features/face-profile/services/faceProfilePixelSignals.ts',
  'features/face-profile/services/faceProfilePixelSignals.test.ts',
  'features/face-profile/services/faceProfileDepthResult.ts',
  'features/face-profile/services/faceProfileDepthResult.test.ts',
  'features/face-profile/services/faceShapeRuleScorer.test.ts',
  'features/face-profile/services/faceProfilePresentation.test.ts',
  'features/face-capture/services/faceCaptureLocalPreviewOwnership.ts',
  'features/face-capture/services/faceCaptureLocalPreviewOwnership.test.ts',
  'features/face-capture/services/faceCapturePreviewLifecycle.ts',
  'features/face-capture/services/faceCapturePreviewLifecycle.test.ts',
  'features/face-profile/services/precomputedFaceLandmarks.ts',
  'features/face-profile/services/precomputedFaceLandmarks.test.ts',
  'features/face-profile/services/faceProfileBuilder.ts',
  'features/face-profile/services/faceProfileBuilder.test.ts',
  'features/face-profile/services/faceProfileService.ts',
  'features/face-profile/services/faceProfileService.test.ts',
  'features/face-analysis/services/faceAnalysisOnDevicePipeline.ts',
  'features/face-analysis/services/faceAnalysisOnDevicePipeline.test.ts',
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
  join(
    outDir,
    'features/face-capture/services/faceCapturePreviewLifecycle.test.js',
  ),
]);

run(process.execPath, [
  join(outDir, 'features/face-profile/services/faceProfileContract.test.js'),
]);

run(process.execPath, [
  join(outDir, 'features/face-profile/services/faceProfileMath.test.js'),
]);

run(process.execPath, [
  join(outDir, 'features/face-profile/services/faceProfileGeometry.test.js'),
]);

run(process.execPath, [
  join(outDir, 'features/face-profile/services/faceProfileQualityGate.test.js'),
]);

run(process.execPath, [
  join(outDir, 'features/face-profile/services/faceProfilePixelSignals.test.js'),
]);

run(process.execPath, [
  join(outDir, 'features/face-profile/services/faceProfileDepthResult.test.js'),
]);

run(process.execPath, [
  join(outDir, 'features/face-profile/services/faceShapeRuleScorer.test.js'),
]);

run(process.execPath, [
  join(outDir, 'features/face-profile/services/faceProfilePresentation.test.js'),
]);

run(process.execPath, [
  join(
    outDir,
    'features/face-capture/services/faceCaptureLocalPreviewOwnership.test.js',
  ),
]);

run(process.execPath, [
  join(outDir, 'features/face-profile/services/precomputedFaceLandmarks.test.js'),
]);

run(process.execPath, [
  join(outDir, 'features/face-profile/services/faceProfileBuilder.test.js'),
]);

run(process.execPath, [
  join(outDir, 'features/face-profile/services/faceProfileService.test.js'),
]);

run(process.execPath, [
  join(
    outDir,
    'features/face-analysis/services/faceAnalysisOnDevicePipeline.test.js',
  ),
]);
