import type {
  FaceImageType,
  LocalBeautySurveyResult,
} from './localBeautySurveyScoring';

type LocalBeautyImageAnalysisItem = {
  label: string;
  value: string;
};

export type LocalBeautyImageAnalysisPresentation = {
  confidenceLabel: string;
  guide: string;
  headline: string;
  items: readonly LocalBeautyImageAnalysisItem[];
  summary: string;
  title: string;
};

const faceImageTypeLabels = {
  chic: '시크',
  classic: '클래식',
  clean: '맑음',
  lovely: '러블리',
  modern: '모던',
  natural: '내추럴',
  soft: '소프트',
} as const satisfies Record<FaceImageType, string>;

const faceImageGuides = {
  chic: '선명한 눈매, 정돈된 베이스, 좁은 립 포인트처럼 라인을 또렷하게 잡아보세요.',
  classic: '톤다운 컬러와 단정한 음영, 정리된 눈썹 라인으로 차분한 균형을 살려보세요.',
  clean: '얇은 베이스와 맑은 치크, 투명한 립 광으로 깨끗한 인상을 이어가보세요.',
  lovely: '작은 곡선 포인트와 밝은 생기 컬러로 부드러운 러블리 무드를 살려보세요.',
  modern: '색을 덜어내고 선명한 포인트 하나만 남겨 미니멀한 인상을 만들어보세요.',
  natural: '피부 결과 컬러 경계를 자연스럽게 낮춰 편안한 분위기를 유지해보세요.',
  soft: '블러 처리한 립과 은은한 음영처럼 경계를 낮춰 부드러운 이미지를 살려보세요.',
} as const satisfies Record<FaceImageType, string>;

export function getLocalBeautyImageTypeLabel(type: FaceImageType) {
  return faceImageTypeLabels[type];
}

export function getLocalBeautyImageAnalysisPresentation(
  result: LocalBeautySurveyResult,
): LocalBeautyImageAnalysisPresentation {
  const secondaryTypeLabel =
    result.faceImage.secondary
      ? result.faceImage.secondary.label
      : result.faceImage.secondaryTypes.length > 0
      ? result.faceImage.secondaryTypes.map(getLocalBeautyImageTypeLabel).join(' · ')
      : '균형형';

  return {
    confidenceLabel: `${Math.round(result.faceImage.confidence * 100)}%`,
    guide: faceImageGuides[result.faceImage.primaryType],
    headline: result.faceImage.blendLabel ?? result.faceImage.label,
    items: [
      {
        label: '1순위 이미지',
        value: getLocalBeautyImageTypeLabel(result.faceImage.primaryType),
      },
      {
        label: '2순위 이미지',
        value: secondaryTypeLabel,
      },
      {
        label: '이미지 키워드',
        value: result.faceImage.keywords.join(' · '),
      },
    ],
    summary: result.faceImage.summary,
    title: '이미지 분석',
  };
}
