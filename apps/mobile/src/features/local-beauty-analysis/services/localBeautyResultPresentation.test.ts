import {
  getLocalBeautyHairTips,
  getLocalBeautyMakeupTips,
  getLocalBeautyRecentResultCards,
  getLocalBeautyResultDetailCards,
  getLocalBeautyStyleTips,
} from './localBeautyResultPresentation';
import type {LocalBeautySurveyResult} from './localBeautySurveyScoring';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const result = {
  analyzedAt: '2026-07-01T00:00:00.000Z',
  avoidedMakeupNotes: ['넓은 코랄 블러셔보다 좁은 포인트 컬러가 더 안정적이에요.'],
  faceImage: {
    confidence: 0.84,
    keywords: ['선명한 라인', '절제된 포인트', '쿨한 무드'],
    label: '시크하고 모던한 이미지',
    primaryType: 'chic',
    secondaryTypes: ['modern', 'classic'],
    summary: '깔끔한 여백과 또렷한 포인트를 줄 때 인상이 가장 세련되게 정리돼요.',
  },
  hairRecommendation: {
    color: '딥 블랙이나 쿨 다크 브라운',
    label: '슬릭 스트레이트 롱',
    summary: '선명한 라인과 차분한 윤기를 살린 헤어가 인상을 또렷하게 정리해요.',
    tips: ['앞머리는 가볍게 비우고 얼굴 옆 라인을 정돈해보세요.', '무거운 컬보다 매끈한 결 표현이 더 안정적이에요.'],
  },
  styleRecommendation: {
    fit: '어깨선과 세로선을 선명하게 잡는 구조적인 핏',
    label: '어반 포인트 실루엣',
    silhouette: '긴 직선감과 강한 포인트를 하나만 남기는 스타일',
    summary: '선명한 라인과 절제된 컬러 대비가 시크한 이미지를 또렷하게 살려줘요.',
    tips: ['재킷, 롱 스커트, 스트레이트 팬츠처럼 세로선을 남겨보세요.', '포인트는 한 곳만 크게 두고 나머지는 미니멀하게 정리해보세요.'],
  },
  id: 'local-beauty-survey-result-detail',
  personalColor: {
    confidence: 0.9,
    depth: 'deep',
    label: '겨울쿨 딥',
    palette: ['#7B2F57', '#111111', '#F5F5F5', '#B1123A'],
    season: 'winterCool',
    summary: '선명한 대비와 좁은 포인트 컬러가 인상을 또렷하고 세련되게 만들어줘요.',
  },
  recommendedMakeupIds: ['winterCool-deep-daily', 'chic-mood-look'],
  recommendedMood: '플럼 모브 포인트',
  surveyAnswers: {
    hairTone: 'deepBlack',
    overallPreference: 'statementChic',
    skinReaction: 'clearContrast',
  },
  unknownQuestionIds: [],
} as const satisfies LocalBeautySurveyResult;

const detailCards = getLocalBeautyResultDetailCards(result);
const hairTips = getLocalBeautyHairTips(result);
const makeupTips = getLocalBeautyMakeupTips(result);
const styleTips = getLocalBeautyStyleTips(result);
const recentCards = getLocalBeautyRecentResultCards([result]);

expectEqual(detailCards.length, 3, 'local beauty detail card count');
expectEqual(detailCards[0].title, '컬러 핵심', 'local beauty detail color card');
expectEqual(detailCards[1].value, '시크하고 모던한 이미지', 'local beauty detail image card');
expectEqual(makeupTips.length, 3, 'local beauty makeup tip count');
expectEqual(hairTips.length, 2, 'local beauty hair tip count');
expectEqual(hairTips[0], '앞머리는 가볍게 비우고 얼굴 옆 라인을 정돈해보세요.', 'local beauty hair tip');
expectEqual(styleTips.length, 2, 'local beauty style tip count');
expectEqual(styleTips[0], '재킷, 롱 스커트, 스트레이트 팬츠처럼 세로선을 남겨보세요.', 'local beauty style tip');
expectEqual(makeupTips[0].title, '베이스', 'local beauty base tip title');
expectEqual(
  makeupTips[1].body.includes('플럼 모브 포인트'),
  true,
  'local beauty makeup tip references mood',
);
expectEqual(recentCards[0]?.resultId, result.id, 'local beauty recent card result id');
expectEqual(recentCards[0]?.title, '겨울쿨 딥', 'local beauty recent card title');
