import React from 'react';

import {
  FACE_ANALYSIS_REPORT_CARD_LAYOUT,
  FaceAnalysisReportCard,
  getFaceAnalysisReportCardTags,
  toFaceAnalysisReportCardData,
} from './FaceAnalysisReportCard';
import {faceAnalysisReportsMock} from '../../../shared/mocks/faceAnalysis.mock';
import {validReadyProfile} from '../../face-profile/services/faceProfileContract.test';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  FACE_ANALYSIS_REPORT_CARD_LAYOUT,
  'journal-entry',
  'face analysis report list card uses journal entry layout',
);

const summaryOnlyCardData = toFaceAnalysisReportCardData({
  ...faceAnalysisReportsMock[0],
  faceProfile: validReadyProfile,
  faceProfileSummary: {
    confidenceGap: 0.24,
    dominantShape: 'round',
    schemaVersion: 'aura-face-profile-v1',
    status: 'full_success',
  },
});
expectEqual(
  'faceProfile' in summaryOnlyCardData,
  false,
  'face analysis list card data strips the full profile',
);
expectEqual(
  getFaceAnalysisReportCardTags(summaryOnlyCardData).includes('둥근형'),
  true,
  'face analysis list card uses scalar summary shape',
);
expectEqual(
  getFaceAnalysisReportCardTags(summaryOnlyCardData).includes('타원형'),
  false,
  'face analysis list card ignores conflicting full profile shape',
);

const legacyCardData = toFaceAnalysisReportCardData({
  ...faceAnalysisReportsMock[1],
  faceProfile: undefined,
  faceProfileSummary: undefined,
  faceShape: '레거시 계란형',
});
expectEqual(
  getFaceAnalysisReportCardTags(legacyCardData).includes('레거시 계란형'),
  true,
  'legacy list card keeps its existing face shape without a current summary',
);

<FaceAnalysisReportCard
  onPress={() => undefined}
  report={summaryOnlyCardData}
/>;
