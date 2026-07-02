import {getLocalBeautyImageTypeLabel} from './localBeautyImageAnalysisPresentation';
import type {
  FaceImageType,
  LocalBeautySurveyResult,
  PersonalColorDepth,
  PersonalColorSeason,
} from './localBeautySurveyScoring';

export type LocalBeautyResultDetailCard = {
  body: string;
  title: string;
  value: string;
};

export type LocalBeautyMakeupTip = {
  body: string;
  title: string;
};

export type LocalBeautyRecentResultCard = {
  meta: string;
  resultId: string;
  subtitle: string;
  swatches: readonly string[];
  title: string;
};

const baseTipsBySeason = {
  autumnWarm: '베이지 베이스와 낮은 채도의 음영으로 피부 결을 차분하게 정돈해보세요.',
  neutral: '베이스는 노랗거나 붉은 방향으로 치우치지 않게 얇게 맞춰보세요.',
  springWarm: '얇은 윤광 베이스와 피치빛 생기로 얼굴의 맑은 온도를 살려보세요.',
  summerCool: '핑크빛을 낮게 깔고 보송한 광을 더하면 피부가 더 깨끗하게 보여요.',
  winterCool: '밝기를 균일하게 맞추고 대비를 살려 또렷한 베이스를 만들어보세요.',
} as const satisfies Record<PersonalColorSeason, string>;

const colorTipsByDepth = {
  bright: '채도를 한 번에 많이 올리기보다 립이나 치크 한 곳에 산뜻하게 집중해보세요.',
  clear: '탁한 중간색을 줄이고 맑은 컬러를 얇게 올리면 답변 경향과 잘 맞아요.',
  deep: '짙은 컬러는 면적을 좁혀 선명한 포인트로 쓰면 부담이 줄어요.',
  light: '밝은 컬러를 넓게 쓰고 경계는 낮추면 얼굴이 편안해 보여요.',
  mute: '채도를 낮춘 컬러를 여러 번 얇게 쌓아 깊이를 만들어보세요.',
  soft: '부드러운 색을 블렌딩해서 립과 치크의 경계를 자연스럽게 이어보세요.',
} as const satisfies Record<PersonalColorDepth, string>;

const imageTipsByType = {
  chic: '눈매와 립 라인 중 하나만 또렷하게 잡아 시크한 여백을 남겨보세요.',
  classic: '눈썹, 음영, 립 경계를 단정하게 맞추면 클래식한 균형이 살아나요.',
  clean: '피부 표현을 얇게 두고 투명한 치크로 맑은 이미지를 유지해보세요.',
  lovely: '작은 곡선 포인트와 생기 컬러로 러블리한 인상을 더해보세요.',
  modern: '색 수를 줄이고 한 가지 포인트만 남기면 모던한 인상이 선명해져요.',
  natural: '피부 결과 립 경계를 낮춰 편안한 내추럴 무드를 살려보세요.',
  soft: '블러 립과 은은한 음영처럼 경계를 낮춘 표현이 잘 맞아요.',
} as const satisfies Record<FaceImageType, string>;

export function getLocalBeautyResultDetailCards(
  result: LocalBeautySurveyResult,
): readonly LocalBeautyResultDetailCard[] {
  return [
    {
      body: result.personalColor.summary,
      title: '컬러 핵심',
      value: result.personalColor.label,
    },
    {
      body: result.faceImage.summary,
      title: '이미지 핵심',
      value: result.faceImage.label,
    },
    {
      body: `${result.personalColor.label}의 색감과 ${getLocalBeautyImageTypeLabel(result.faceImage.primaryType)} 이미지를 함께 맞춘 방향이에요.`,
      title: '추천 방향',
      value: result.recommendedMood,
    },
  ];
}

export function getLocalBeautyMakeupTips(
  result: LocalBeautySurveyResult,
): readonly LocalBeautyMakeupTip[] {
  return [
    {
      body: baseTipsBySeason[result.personalColor.season],
      title: '베이스',
    },
    {
      body: `${result.recommendedMood}를 중심으로 ${colorTipsByDepth[result.personalColor.depth]}`,
      title: '컬러',
    },
    {
      body: imageTipsByType[result.faceImage.primaryType],
      title: '이미지 포인트',
    },
  ];
}

export function getLocalBeautyHairTips(
  result: LocalBeautySurveyResult,
): readonly string[] {
  return result.hairRecommendation.tips;
}

export function getLocalBeautyStyleTips(
  result: LocalBeautySurveyResult,
): readonly string[] {
  return result.styleRecommendation.tips;
}

export function getLocalBeautyRecentResultCards(
  results: readonly LocalBeautySurveyResult[],
): readonly LocalBeautyRecentResultCard[] {
  return results.map(result => ({
    meta: formatLocalBeautyResultDate(result.analyzedAt),
    resultId: result.id,
    subtitle: `${result.faceImage.label} · ${result.recommendedMood}`,
    swatches: result.personalColor.palette.slice(0, 3),
    title: result.personalColor.label,
  }));
}

function formatLocalBeautyResultDate(value: string) {
  return value.slice(0, 10).replace(/-/g, '.');
}
