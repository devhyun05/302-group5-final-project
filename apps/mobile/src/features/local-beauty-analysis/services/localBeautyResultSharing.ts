import type {CaptureRefOptions} from 'react-native-view-shot';

import type {LocalBeautySurveyResult} from './localBeautySurveyScoring';

export type LocalBeautyResultShareActionId = 'shareImage';

export type LocalBeautyResultShareAction = {
  helper: string;
  id: LocalBeautyResultShareActionId;
  label: string;
  shareTitle: string;
};

const localBeautyResultShareActions = [
  {
    helper: '결과지를 이미지로 만들어 iOS 기본 공유 기능으로 공유해요.',
    id: 'shareImage',
    label: '공유하기',
    shareTitle: 'AURA 설문 분석 결과',
  },
] as const satisfies readonly LocalBeautyResultShareAction[];

export function getLocalBeautyResultShareActions() {
  return localBeautyResultShareActions;
}

export function getLocalBeautyResultCaptureOptions(
  result: LocalBeautySurveyResult,
): CaptureRefOptions {
  return {
    fileName: `aura-local-beauty-${sanitizeShareFileName(result.id)}`,
    format: 'jpg',
    quality: 0.92,
    result: 'tmpfile',
    snapshotContentContainer: true,
  };
}

export function normalizeLocalBeautyResultShareUrl(uri: string) {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

export function getLocalBeautyResultShareFallbackMessage(
  result: LocalBeautySurveyResult,
) {
  return [
    `퍼스널 컬러: ${result.personalColor.label}`,
    `이미지 타입: ${result.faceImage.label}`,
    `패션/핏: ${result.styleRecommendation.label}`,
    `추천 무드: ${result.recommendedMood}`,
  ].join('\n');
}

function sanitizeShareFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '');
}
