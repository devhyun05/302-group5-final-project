import {
  faceAnalysisReportsMock,
  getFaceAnalysisAvoidedMakeupImageAssetNames,
} from './faceAnalysis.mock';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const avoidedImageAssetNames = getFaceAnalysisAvoidedMakeupImageAssetNames();
const smokyImageAssetName: 'report-avoid-heavy-smoky.png' =
  avoidedImageAssetNames['너무 진한 스모키'];
const contourImageAssetName: 'report-avoid-strong-contour.png' =
  avoidedImageAssetNames['과한 컨투어링'];

expectEqual(
  avoidedImageAssetNames['너무 진한 스모키'],
  smokyImageAssetName,
  'heavy smoky image asset',
);
expectEqual(
  avoidedImageAssetNames['과한 컨투어링'],
  contourImageAssetName,
  'strong contour image asset',
);

expectEqual(
  faceAnalysisReportsMock[0].faceProfileSummary?.dominantShape,
  'oval',
  'current-version mock exposes only a scalar deterministic profile summary',
);
const serializedProfileMock = JSON.stringify(
  faceAnalysisReportsMock[0].faceProfileSummary,
);
for (const forbidden of [
  'rawLandmarks',
  'landmarks',
  'depthMap',
  'nativeDepthToken',
  'nativeMatteToken',
  'calibrationData',
  'semanticMatte',
  'sourceUri',
  'roiPixels',
]) {
  expectEqual(
    new RegExp(`"${forbidden}"\\s*:`, 'i').test(serializedProfileMock),
    false,
    `mock profile summary omits ${forbidden}`,
  );
}
