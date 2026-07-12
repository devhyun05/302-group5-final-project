import {readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

function filesUnder(relativeRoot, extensions) {
  const root = join(repoRoot, relativeRoot);
  const files = [];
  const visit = path => {
    for (const entry of readdirSync(path)) {
      const child = join(path, entry);
      if (statSync(child).isDirectory()) {
        visit(child);
      } else if (extensions.some(extension => child.endsWith(extension))) {
        files.push(child);
      }
    }
  };
  visit(root);
  return files;
}

const nativeCapture = read('apps/mobile/ios/AURA/AURARealtimeFaceCaptureView.m');
requireMatch(
  nativeCapture,
  /if \(self->_transientDepthCapture\)[\s\S]{0,420}embedsDepthDataInPhoto\s*=\s*NO;[\s\S]{0,220}embedsSemanticSegmentationMattesInPhoto\s*=\s*NO;/,
  'face_analysis transient capture must embed neither depth nor semantic mattes',
);
requireMatch(
  nativeCapture,
  /else if \(deliversSemanticMattes\)[\s\S]{0,260}embedsSemanticSegmentationMattesInPhoto\s*=\s*YES;/,
  'legacy semantic-matte-only capture compatibility must remain enabled',
);
requireMatch(
  nativeCapture,
  /RCT_EXPORT_VIEW_PROPERTY\(transientDepthCapture,\s*BOOL\)/,
  'transientDepthCapture must be exported to React Native',
);

const sanitizerTests = read(
  'apps/mobile/ios/AURATests/AURAFaceAnalysisMediaSanitizerTests.m',
);
for (const proof of [
  'kCGImagePropertyGPSDictionary',
  'kCGImagePropertyIPTCDictionary',
  'private-xmp-fixture',
  'AURAFaceAnalysisInspectionHasGPS',
]) {
  if (!sanitizerTests.includes(proof)) {
    throw new Error(`sanitizer read-back proof missing: ${proof}`);
  }
}

const uploadContract = read(
  'apps/mobile/src/features/face-capture/services/faceCaptureUploadContract.ts',
);
const faceAnalysisBranch = uploadContract.match(
  /if \(input\.captureType === 'face_analysis'\) \{([\s\S]*?)\n  \}/,
)?.[1];
if (!faceAnalysisBranch) {
  throw new Error('face_analysis device payload allowlist branch is missing');
}
for (const required of ['contentType', 'height', 'rawSensorArtifactsStored', 'width']) {
  if (!faceAnalysisBranch.includes(required)) {
    throw new Error(`face_analysis device payload is missing ${required}`);
  }
}
for (const forbidden of [
  'sourceUri',
  'originalFilename',
  'nativeDepthToken',
  'nativeMatteToken',
  'trueDepth',
  'semanticMattes',
]) {
  if (faceAnalysisBranch.includes(forbidden)) {
    throw new Error(`face_analysis device payload leaks ${forbidden}`);
  }
}
requireMatch(
  faceAnalysisBranch,
  /rawSensorArtifactsStored:\s*false/,
  'face_analysis device payload must declare rawSensorArtifactsStored false',
);

const uploadService = read(
  'apps/mobile/src/features/face-capture/services/faceCaptureUploadService.ts',
);
requireMatch(
  uploadService,
  /devicePayload:\s*buildFaceCaptureDevicePayload\(/,
  'photo-captures must use the device payload privacy allowlist',
);

const pipeline = read(
  'apps/mobile/src/features/face-analysis/services/faceAnalysisOnDevicePipeline.ts',
);
requireMatch(
  pipeline,
  /Object\.defineProperty\([\s\S]*?enumerable:\s*false/,
  'derived profile and preview ownership must be non-enumerable',
);
requireMatch(
  pipeline,
  /mirrored:\s*false/,
  'sanitized upright pixels must not use a facing-derived mirror override',
);

const verticalService = read(
  'apps/mobile/src/features/face-ratio/services/faceVerticalThirdsService.ts',
);
const personalService = read(
  'apps/mobile/src/features/personal-color/services/personalColorService.ts',
);
for (const [name, source] of [
  ['vertical thirds', verticalService],
  ['personal color', personalService],
]) {
  requireMatch(
    source,
    /resolveFaceAnalysisLandmarks\([\s\S]{0,180}precomputedLandmarks/,
    `${name} must reuse precomputed landmarks`,
  );
  requireMatch(
    source,
    /artifactPolicy[\s\S]{0,120}'face_profile'/,
    `${name} must carry the face_profile artifact policy`,
  );
}

const publicProfile = read('apps/mobile/src/shared/types/faceProfile.ts');
const resultType = publicProfile.match(
  /export type FaceProfileResult = \{([\s\S]*?)\n\};/,
)?.[1];
if (!resultType) {
  throw new Error('FaceProfileResult public contract is missing');
}
for (const forbidden of [
  'landmarks',
  'depthMap',
  'nativeDepthToken',
  'nativeMatteToken',
  'matte',
  'pixelArray',
]) {
  if (resultType.toLowerCase().includes(forbidden.toLowerCase())) {
    throw new Error(`FaceProfileResult public contract leaks ${forbidden}`);
  }
}
requireMatch(
  resultType,
  /trainingUseAllowed:\s*false/,
  'FaceProfileResult must keep trainingUseAllowed false',
);

const loggedTokenPattern =
  /(NSLog|console\.(?:info|log|warn|error))[^\n]*(token|Token)|(token|Token)[^\n]*(NSLog|console\.(?:info|log|warn|error))/;
const scannedFiles = [
  ...filesUnder('apps/mobile/ios/AURA', ['.m', '.h']),
  ...filesUnder('apps/mobile/src/features/face-analysis', ['.ts', '.tsx']),
  ...filesUnder('apps/mobile/src/features/face-capture', ['.ts', '.tsx']),
  ...filesUnder('apps/mobile/src/features/face-profile', ['.ts', '.tsx']),
  ...filesUnder('apps/mobile/src/features/face-ratio', ['.ts', '.tsx']),
  ...filesUnder('apps/mobile/src/features/personal-color', ['.ts', '.tsx']),
];
for (const file of scannedFiles) {
  if (loggedTokenPattern.test(readFileSync(file, 'utf8'))) {
    throw new Error(`token logging is forbidden: ${file.slice(repoRoot.length + 1)}`);
  }
}

console.log('Face profile native privacy allowlist verified.');
