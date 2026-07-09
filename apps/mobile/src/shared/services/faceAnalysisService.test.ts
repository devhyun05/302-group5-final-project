import {
  buildFaceAnalysisCameraAnalysisContext,
  buildFaceAnalysisCameraPersonalColorContext,
  mapBackendJobToFaceAnalysisReport,
  resolveFaceAnalysisReportImageSource,
} from './faceAnalysisService';
import type {AuraPersonalColorResult} from '../../features/personal-color/types';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const originalApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const originalCdnBaseUrl = process.env.EXPO_PUBLIC_CDN_BASE_URL;

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://cdn.example.com/api';

const localCaptureSource = resolveFaceAnalysisReportImageSource(
  {
    detailPayload: {
      request: {
        cdnUrl: 'https://cdn.example.com/uploads/capture/server-face.jpg',
      },
    },
  },
  {
    imageUri: 'file:///tmp/latest-face.jpg',
  },
) as {uri?: string};

expectEqual(
  localCaptureSource.uri,
  'file:///tmp/latest-face.jpg',
  'analysis report image source prefers the just-captured local image',
);

const storedCaptureSource = resolveFaceAnalysisReportImageSource({
  detailPayload: {
    request: {
      cdnUrl: 'https://cdn.example.com/uploads/capture/stored-face.jpg',
    },
  },
}) as {uri?: string};

expectEqual(
  storedCaptureSource.uri,
  'https://cdn.example.com/uploads/capture/stored-face.jpg',
  'analysis report image source restores stored capture cdn url',
);

const objectKeySource = resolveFaceAnalysisReportImageSource({
  detailPayload: {
    request: {
      objectKey: 'uploads/capture/object-key-face.jpg',
    },
  },
}) as {uri?: string};

expectEqual(
  objectKeySource.uri,
  'https://cdn.example.com/uploads/capture/object-key-face.jpg',
  'analysis report image source builds cdn url from stored object key',
);

process.env.EXPO_PUBLIC_CDN_BASE_URL = 'https://media.example.com/';

const explicitCdnObjectKeySource = resolveFaceAnalysisReportImageSource({
  detailPayload: {
    request: {
      objectKey: 'uploads/capture/explicit-cdn-face.jpg',
    },
  },
}) as {uri?: string};

expectEqual(
  explicitCdnObjectKeySource.uri,
  'https://media.example.com/uploads/capture/explicit-cdn-face.jpg',
  'analysis report image source uses explicit cdn base url before api base url',
);

const personalColorContext = buildFaceAnalysisCameraPersonalColorContext({
  measurementConfidence: 0.78,
  status: 'definitive',
  tone: {
    gap: 0.2,
    isMixed: false,
    season: 'summer',
    secondary: 'summer_true',
    top: 'summer_light',
    typeScore: 0.83,
  },
  warnings: ['low light'],
} as unknown as AuraPersonalColorResult);

expectEqual(
  personalColorContext?.label,
  '여름 라이트',
  'camera personal color context stores the on-device Korean label',
);
expectEqual(
  personalColorContext?.tone,
  'summer_light',
  'camera personal color context keeps the on-device top tone',
);

const cameraAnalysisContext = buildFaceAnalysisCameraAnalysisContext({
  captureId: 'capture-current',
  faceVerticalThirds: {
    confidence: 0.86,
    displayRatio: {
      lower: 1.14,
      middle: 1,
      upper: 0.92,
    },
    dominantPart: 'lower',
    hairline: {
      confidence: 0.72,
      provider: 'vision',
    },
    measurement: {
      mode: 'precision',
      semanticMatteAvailable: true,
      semanticMatteRequested: true,
      source: 'apple_semantic_matte',
      trueDepthCorrectionApplied: false,
      warnings: [],
    },
    status: 'full_success',
    summary: '하안부가 살짝 긴 편이에요.',
  },
  personalColor: {
    measurementConfidence: 0.78,
    status: 'definitive',
    tone: {
      gap: 0.2,
      isMixed: false,
      season: 'summer',
      secondary: 'summer_true',
      top: 'summer_light',
      typeScore: 0.83,
    },
    warnings: [],
  } as unknown as AuraPersonalColorResult,
});

expectEqual(
  cameraAnalysisContext?.captureId,
  'capture-current',
  'camera analysis context is scoped by capture id',
);
expectEqual(
  cameraAnalysisContext?.faceVerticalThirds?.displayRatio.lower,
  1.14,
  'camera analysis context carries vertical thirds ratio',
);
expectEqual(
  cameraAnalysisContext?.personalColor?.label,
  '여름 라이트',
  'camera analysis context carries personal color baseline',
);
expectEqual(
  cameraAnalysisContext?.faceVerticalThirds?.measurement?.source,
  'apple_semantic_matte',
  'camera analysis context carries vertical thirds measurement source',
);

const restoredStoredReport = mapBackendJobToFaceAnalysisReport({
  detailPayload: {
    request: {
      cameraAnalysisContext,
    },
    result: {
      personalColor: 'AI 임의 톤',
      recommendedMakeups: [
        {
          description: '맑은 라벤더 블러셔를 얇게 올려요.',
          subtitle: '라벤더 핑크',
          title: '쿨 라이트 메이크업',
        },
      ],
      shortSummary: '온디바이스 기준값을 반영한 보고서예요.',
      summary: '온디바이스 기준값을 반영한 보고서예요.',
    },
  },
  id: 'stored-report',
  personalColor: '백엔드 저장 톤',
});

expectEqual(
  restoredStoredReport.personalColor,
  '여름 라이트',
  'stored reports prefer on-device personal color over AI result text',
);
expectEqual(
  restoredStoredReport.captureId,
  'capture-current',
  'stored reports restore capture id from camera analysis context',
);
expectEqual(
  restoredStoredReport.cameraAnalysisContext?.faceVerticalThirds?.displayRatio.lower,
  1.14,
  'stored reports restore camera vertical thirds context',
);
expectEqual(
  restoredStoredReport.cameraAnalysisContext?.faceVerticalThirds?.measurement?.mode,
  'precision',
  'stored reports restore vertical thirds precision mode',
);

process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBaseUrl;
process.env.EXPO_PUBLIC_CDN_BASE_URL = originalCdnBaseUrl;
