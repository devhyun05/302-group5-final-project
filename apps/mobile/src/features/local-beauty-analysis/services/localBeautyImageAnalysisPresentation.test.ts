import {
  getLocalBeautyImageAnalysisPresentation,
  getLocalBeautyImageTypeLabel,
} from './localBeautyImageAnalysisPresentation';
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
  id: 'local-beauty-survey-result-image',
  personalColor: {
    colorAnalysis: {
      axes: [
        {id: 'temperature', label: '색온도', summary: '쿨 방향이 안정적이에요.', value: '높음'},
        {id: 'value', label: '명도', summary: '깊이와 대비가 중요해요.', value: '높음'},
        {id: 'chroma', label: '채도', summary: '선명한 채도가 잘 맞아요.', value: '중간'},
        {id: 'neutralBalance', label: '뉴트럴', summary: '중간색으로 완충하면 좋아요.', value: '낮음'},
      ],
      priorityLabel: '명도 우선형',
      prioritySummary: '색의 온도보다 밝고 가벼운지, 깊고 또렷한지가 얼굴 분위기를 더 많이 좌우해요.',
      priorityType: 'value',
    },
    confidence: 0.9,
    depth: 'deep',
    label: '겨울쿨 딥',
    palette: ['#7B2F57', '#111111', '#F5F5F5', '#B1123A'],
    season: 'winterCool',
    summary: '선명한 대비와 좁은 포인트 컬러가 인상을 또렷하고 세련되게 만들어줘요.',
  },
  recommendedMakeupIds: ['winterCool-deep-daily', 'chic-mood-look'],
  recommendedMood: '플럼 모브 포인트',
  situationAnalysis: [
    {
      id: 'photo',
      label: '사진',
      summary: '렌즈 앞에서는 대비와 라인이 살아날수록 존재감이 또렷해져요.',
      tips: ['립이나 눈매 한 곳에 선명한 포인트를 두면 좋아요.'],
      title: '존재감 있는 촬영 무드',
    },
  ],
  surveyAnswers: {
    hairTone: ['deepBlack'],
    overallPreference: ['statementChic'],
    skinReaction: ['clearContrast'],
  },
  unknownQuestionIds: [],
} as const satisfies LocalBeautySurveyResult;

const presentation = getLocalBeautyImageAnalysisPresentation(result);

expectEqual(presentation.title, '이미지 분석', 'image analysis title');
expectEqual(
  presentation.headline,
  '시크하고 모던한 이미지',
  'image analysis headline',
);
expectEqual(presentation.confidenceLabel, '84%', 'image analysis confidence label');
expectEqual(
  getLocalBeautyImageTypeLabel('modern'),
  '모던',
  'image type short label',
);
expectEqual(
  presentation.items[0].value,
  '시크',
  'image analysis primary type item',
);
expectEqual(
  presentation.items[1].value,
  '모던 · 클래식',
  'image analysis secondary type item',
);
expectEqual(
  presentation.items[2].value,
  '선명한 라인 · 절제된 포인트 · 쿨한 무드',
  'image analysis keyword item',
);
expectEqual(
  presentation.guide,
  '선명한 눈매, 정돈된 베이스, 좁은 립 포인트처럼 라인을 또렷하게 잡아보세요.',
  'image analysis guide',
);
