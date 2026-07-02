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
    helper: '결과지를 JPG 이미지로 만들어 iOS 공유 시트에서 이미지 저장이나 앱 공유를 선택할 수 있어요.',
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
    fileName: getLocalBeautyResultShareFileName(result),
    format: 'jpg',
    quality: 0.92,
    result: 'tmpfile',
    snapshotContentContainer: false,
  };
}

export function normalizeLocalBeautyResultShareUrl(uri: string) {
  const fileUrl = uri.startsWith('file://') ? uri : `file://${uri}`;

  return hasJpegExtension(fileUrl) ? fileUrl : `${fileUrl}.jpg`;
}

export function getLocalBeautyResultShareFallbackMessage(
  result: LocalBeautySurveyResult,
) {
  return [
    `퍼스널 컬러: ${result.personalColor.blendLabel ?? result.personalColor.label}`,
    `이미지 타입: ${result.faceImage.blendLabel ?? result.faceImage.label}`,
    `패션/핏: ${result.styleRecommendation.label}`,
    `추천 무드: ${result.recommendedMood}`,
  ].join('\n');
}

function sanitizeShareFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '');
}

function getLocalBeautyResultShareFileName(result: LocalBeautySurveyResult) {
  return `aura-local-beauty-${sanitizeShareFileName(result.id)}.jpg`;
}

function hasJpegExtension(value: string) {
  return /\.jpe?g$/i.test(value);
}
