import {
  getLocalBeautyResultCaptureOptions,
  getLocalBeautyResultShareActions,
  getLocalBeautyResultShareFallbackMessage,
  normalizeLocalBeautyResultShareUrl,
} from './localBeautyResultSharing';
import type {LocalBeautySurveyResult} from './localBeautySurveyScoring';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const result = {
  analyzedAt: '2026-07-01T00:00:00.000Z',
  avoidedMakeupNotes: ['오렌지기가 강한 코랄은 피부를 노랗게 보이게 할 수 있어요.'],
  faceImage: {
    confidence: 0.82,
    keywords: ['은은함', '맑은 음영', '소프트 컬러'],
    label: '부드럽고 내추럴한 이미지',
    primaryType: 'soft',
    secondaryTypes: ['clean', 'natural'],
    summary: '채도를 낮추고 경계를 흐리면 전체 인상이 부드럽고 안정적으로 보여요.',
  },
  hairRecommendation: {
    color: '애쉬 브라운이나 소프트 다크 브라운',
    label: '내추럴 미디엄 레이어',
    summary: '자연스러운 층과 공기감이 편안한 분위기를 부드럽게 살려줘요.',
    tips: ['얼굴 옆머리는 과하게 고정하지 말고 결을 남겨보세요.', '컬은 굵고 느슨하게 넣어 부담을 낮추면 안정적이에요.'],
  },
  styleRecommendation: {
    fit: '너무 붙지 않는 편안한 여유핏',
    label: '소프트 캐주얼 핏',
    silhouette: '부드러운 레이어와 자연스러운 소재 중심',
    summary: '편안한 소재와 과하지 않은 여유가 내추럴한 이미지를 안정적으로 보여줘요.',
    tips: ['셔츠나 니트는 몸에서 살짝 떨어지는 핏을 골라보세요.', '톤 차이가 크지 않은 레이어링이 얼굴 분위기와 잘 맞아요.'],
  },
  id: 'local-beauty-survey-result/one',
  personalColor: {
    colorAnalysis: {
      axes: [
        {id: 'temperature', label: '색온도', summary: '쿨 방향이 안정적이에요.', value: '높음'},
        {id: 'value', label: '명도', summary: '밝은 톤이 편안해요.', value: '중간'},
        {id: 'chroma', label: '채도', summary: '낮은 채도가 안정적이에요.', value: '중간'},
        {id: 'neutralBalance', label: '뉴트럴', summary: '중간색으로 완충하면 좋아요.', value: '낮음'},
      ],
      priorityLabel: '색온도 민감형',
      prioritySummary: '웜/쿨 방향이 얼굴의 생기와 투명도에 먼저 영향을 주는 편이에요.',
      priorityType: 'temperature',
    },
    confidence: 0.88,
    depth: 'light',
    label: '여름쿨 라이트',
    palette: ['#D8C8E8', '#DFA9BA', '#B9C9E6', '#F4EAF1'],
    season: 'summerCool',
    summary: '차갑고 은은한 로즈, 라벤더, 소프트 블루 계열이 피부를 맑고 정돈되어 보이게 해요.',
  },
  recommendedMakeupIds: ['summerCool-light-daily', 'soft-mood-look'],
  recommendedMood: '뮤트 로즈 데일리',
  situationAnalysis: [
    {
      id: 'daily',
      label: '데일리',
      summary: '부드러운 색과 편안한 핏이 잘 맞아요.',
      tips: ['차분한 니트와 셔츠를 활용해보세요.'],
      title: '편안한 내추럴 데일리',
    },
  ],
  surveyAnswers: {
    hairTone: ['ashBrown'],
    overallPreference: ['coolClean'],
    skinReaction: ['pinkCool'],
  },
  unknownQuestionIds: [],
} as const satisfies LocalBeautySurveyResult;

const shareActions = getLocalBeautyResultShareActions();
const captureOptions = getLocalBeautyResultCaptureOptions(result);
const fallbackMessage = getLocalBeautyResultShareFallbackMessage(result);
const expectedShareActionCount: typeof shareActions['length'] = 1;
const expectedShareActionId: typeof shareActions[0]['id'] = 'shareImage';
const expectedShareActionLabel: typeof shareActions[0]['label'] = '공유하기';
const expectedShareActionHelper: typeof shareActions[0]['helper'] =
  '결과지를 이미지로 만들어 iOS 기본 공유 기능으로 공유해요.';

expectEqual(shareActions.length, expectedShareActionCount, 'local beauty result share action count');
expectEqual(shareActions[0].id, expectedShareActionId, 'local beauty result share action id');
expectEqual(shareActions[0].label, expectedShareActionLabel, 'local beauty result primary share label');
expectEqual(
  shareActions[0].helper,
  expectedShareActionHelper,
  'local beauty result share helper',
);
expectEqual(captureOptions.format, 'jpg', 'local beauty result capture format');
expectEqual(captureOptions.result, 'tmpfile', 'local beauty result capture output');
expectEqual(
  captureOptions.snapshotContentContainer,
  true,
  'local beauty result full scroll capture',
);
expectEqual(
  captureOptions.fileName,
  'aura-local-beauty-local-beauty-survey-result-one',
  'local beauty result sanitized capture file name',
);
expectEqual(
  normalizeLocalBeautyResultShareUrl('/tmp/aura-result.jpg'),
  'file:///tmp/aura-result.jpg',
  'local beauty result share url adds file scheme',
);
expectEqual(
  normalizeLocalBeautyResultShareUrl('file:///tmp/aura-result.jpg'),
  'file:///tmp/aura-result.jpg',
  'local beauty result share url keeps file scheme',
);
expectEqual(
  fallbackMessage.includes('퍼스널 컬러: 여름쿨 라이트'),
  true,
  'local beauty result fallback includes personal color',
);
expectEqual(
  fallbackMessage.includes('패션/핏: 소프트 캐주얼 핏'),
  true,
  'local beauty result fallback includes style',
);
