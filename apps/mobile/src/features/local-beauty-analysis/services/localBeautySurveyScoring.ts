export const LOCAL_BEAUTY_UNKNOWN_OPTION_ID = 'unknown' as const;
export const LOCAL_BEAUTY_UNKNOWN_OPTION_DESCRIPTION = '' as const;
export const LOCAL_BEAUTY_MAX_SELECTED_OPTIONS = 2 as const;

export type LocalBeautySurveyQuestionId = string;

export type LocalBeautySurveyOptionId = string;
export type LocalBeautySurveyAnswer = readonly LocalBeautySurveyOptionId[];

export type PersonalColorSeason =
  | 'springWarm'
  | 'summerCool'
  | 'autumnWarm'
  | 'winterCool'
  | 'neutral';

export type PersonalColorDepth =
  | 'light'
  | 'bright'
  | 'mute'
  | 'deep'
  | 'soft'
  | 'clear';

export type FaceImageType =
  | 'clean'
  | 'lovely'
  | 'chic'
  | 'classic'
  | 'natural'
  | 'modern'
  | 'soft';

export type HairRecommendationType =
  | 'classicCcurveMedium'
  | 'naturalLayeredMedium'
  | 'shortTexturedPoint'
  | 'sleekStraightLong'
  | 'softLayeredBob';

export type StyleRecommendationType =
  | 'classicTailoredFit'
  | 'cleanMinimal'
  | 'lightRomantic'
  | 'softCasual'
  | 'urbanStatementFit';

export type LocalBeautySurveyAnswers = Record<
  LocalBeautySurveyQuestionId,
  LocalBeautySurveyAnswer
>;

export type LocalBeautySurveyAnswerInput =
  | LocalBeautySurveyOptionId
  | readonly LocalBeautySurveyOptionId[]
  | undefined;

export type LocalBeautyColorAnalysisAxisId =
  | 'chroma'
  | 'neutralBalance'
  | 'temperature'
  | 'value';

export type LocalBeautySituationAnalysisId = 'daily' | 'work' | 'date' | 'photo';
export type LocalBeautySurveyGender = 'female' | 'male' | 'other' | 'unspecified';

export type LocalBeautyColorAnalysisAxis = {
  id: LocalBeautyColorAnalysisAxisId;
  label: string;
  summary: string;
  value: string;
};

export type LocalBeautySituationAnalysis = {
  id: LocalBeautySituationAnalysisId;
  label: string;
  summary: string;
  tips: readonly string[];
  title: string;
};

export type LocalBeautyResultMode = 'mixed' | 'single';

export type LocalBeautyPersonalColorCandidate = {
  depth: PersonalColorDepth;
  label: string;
  season: PersonalColorSeason;
  summary: string;
};

export type LocalBeautyFaceImageCandidate = {
  label: string;
  summary: string;
  type: FaceImageType;
};

export type LocalBeautySurveyOption = {
  id: LocalBeautySurveyOptionId;
  label: string;
  description: string;
  score?: OptionScore;
};

export type LocalBeautySurveyQuestion = {
  id: LocalBeautySurveyQuestionId;
  eyebrow: string;
  title: string;
  helper: string;
  unknownGuide: string;
  options: readonly LocalBeautySurveyOption[];
};

export type LocalBeautySurveyResult = {
  id: string;
  analyzedAt: string;
  personalColor: {
    blendLabel?: string;
    blendSummary?: string;
    colorAnalysis: {
      axes: readonly LocalBeautyColorAnalysisAxis[];
      priorityLabel: string;
      prioritySummary: string;
      priorityType: LocalBeautyColorAnalysisAxisId;
    };
    confidence: number;
    depth: PersonalColorDepth;
    label: string;
    palette: readonly string[];
    resultMode?: LocalBeautyResultMode;
    season: PersonalColorSeason;
    secondary?: LocalBeautyPersonalColorCandidate | null;
    summary: string;
  };
  faceImage: {
    blendLabel?: string;
    blendSummary?: string;
    confidence: number;
    keywords: readonly string[];
    label: string;
    primaryType: FaceImageType;
    resultMode?: LocalBeautyResultMode;
    secondary?: LocalBeautyFaceImageCandidate | null;
    secondaryTypes: readonly FaceImageType[];
    summary: string;
  };
  hairRecommendation: {
    color: string;
    label: string;
    summary: string;
    tips: readonly string[];
  };
  styleRecommendation: {
    fit: string;
    label: string;
    silhouette: string;
    summary: string;
    tips: readonly string[];
  };
  recommendedMood: string;
  recommendedMakeupIds: readonly string[];
  avoidedMakeupNotes: readonly string[];
  situationAnalysis: readonly LocalBeautySituationAnalysis[];
  surveyAnswers: LocalBeautySurveyAnswers;
  unknownQuestionIds: readonly LocalBeautySurveyQuestionId[];
};

type WeightedScores<Key extends string> = Partial<Record<Key, number>>;

type ScoreRank<Key extends string> = {
  key: Key;
  score: number;
};

type OptionScore = {
  depth?: WeightedScores<PersonalColorDepth>;
  faceImage?: WeightedScores<FaceImageType>;
  hair?: WeightedScores<HairRecommendationType>;
  season?: WeightedScores<PersonalColorSeason>;
  style?: WeightedScores<StyleRecommendationType>;
};

type LocalBeautyGenderPresentation = {
  hairSummary: string;
  hairTip: string;
  situationSummary: string;
  situationTip: string;
  styleSummary: string;
  styleTip: string;
};

type HairToneOptionId = 'ashBrown' | 'deepBlack' | 'softBlack' | 'warmBrown';

const personalColorSeasonOrder = [
  'springWarm',
  'summerCool',
  'autumnWarm',
  'winterCool',
  'neutral',
] as const satisfies readonly PersonalColorSeason[];

const personalColorDepthOrder = [
  'light',
  'bright',
  'mute',
  'deep',
  'soft',
  'clear',
] as const satisfies readonly PersonalColorDepth[];

const faceImageTypeOrder = [
  'clean',
  'lovely',
  'chic',
  'classic',
  'natural',
  'modern',
  'soft',
] as const satisfies readonly FaceImageType[];

const localBeautyMixedScoreRatio = 0.82;

const baseLocalBeautySurveyQuestions = [
  {
    id: 'gender',
    eyebrow: '기본 정보',
    title: '어떤 성별 기준으로 스타일을 해석하면 좋을까요?',
    helper: '컬러 판정 자체보다 헤어, 패션, 상황별 표현 문구를 조정하는 데 사용해요.',
    unknownGuide:
      '확인법: 스타일 추천 문구를 조정하기 위한 선택이에요. 답하고 싶지 않거나 성별 기준을 적용하고 싶지 않으면 모르겠음을 선택해도 괜찮아요.',
    options: [
      {
        id: 'genderFemale',
        label: '여성',
        description: '여성 스타일링 맥락의 헤어, 메이크업, 패션 표현으로 정리해요.',
      },
      {
        id: 'genderMale',
        label: '남성',
        description: '남성 스타일링 맥락의 헤어, 그루밍, 핏 표현으로 정리해요.',
      },
      {
        id: 'genderOther',
        label: '기타',
        description: '젠더리스하고 중성적인 스타일링 언어로 정리해요.',
      },
    ],
  },
  {
    id: 'skinReaction',
    eyebrow: '톤 반응',
    title: '피부가 가장 편안해 보이는 순간은 언제인가요?',
    helper: '평소 사진이나 거울에서 가장 자주 느끼는 쪽을 골라주세요.',
    options: [
      {
        id: 'brightPeach',
        label: '피치빛이 돌 때',
        description: '밝은 조명에서 생기 있고 맑아 보여요.',
      },
      {
        id: 'pinkCool',
        label: '핑크빛이 돌 때',
        description: '붉은기보다 투명하고 차분해 보여요.',
      },
      {
        id: 'calmBeige',
        label: '베이지빛이 돌 때',
        description: '차분하고 부드러운 인상이 안정적이에요.',
      },
      {
        id: 'clearContrast',
        label: '대비가 또렷할 때',
        description: '흑백 대비나 선명한 색에서 얼굴이 살아나요.',
      },
    ],
  },
  {
    id: 'jewelryTone',
    eyebrow: '금속감',
    title: '액세서리는 어떤 톤이 더 자연스럽나요?',
    helper: '반지, 귀걸이, 시계처럼 얼굴 가까이에 오는 금속 기준이에요.',
    options: [
      {
        id: 'gold',
        label: '골드',
        description: '피부가 따뜻하고 부드러워 보여요.',
      },
      {
        id: 'silver',
        label: '실버',
        description: '피부가 깨끗하고 선명해 보여요.',
      },
      {
        id: 'both',
        label: '둘 다 무난함',
        description: '따뜻함과 차가움보다 채도와 밝기가 더 중요해요.',
      },
    ],
  },
  {
    id: 'bestColors',
    eyebrow: '의상 컬러',
    title: '옷을 입었을 때 칭찬을 많이 듣는 색은?',
    helper: '상의를 기준으로 가장 얼굴이 살아나는 색감을 골라주세요.',
    options: [
      {
        id: 'clearWarm',
        label: '아이보리, 피치, 코랄',
        description: '밝고 따뜻한 색이 얼굴을 환하게 만들어요.',
      },
      {
        id: 'powderCool',
        label: '라벤더, 로즈, 소프트 블루',
        description: '은은한 쿨 컬러가 피부를 맑게 보여줘요.',
      },
      {
        id: 'mutedEarth',
        label: '카멜, 올리브, 브라운',
        description: '차분한 흙빛 컬러가 분위기를 안정시켜요.',
      },
      {
        id: 'vividMono',
        label: '블랙, 화이트, 버건디',
        description: '선명한 대비가 인상을 또렷하게 만들어요.',
      },
    ],
  },
  {
    id: 'makeupTone',
    eyebrow: '메이크업',
    title: '가장 실패가 적었던 립/치크 톤은?',
    helper: '최근 자주 손이 가는 색이나 사진에서 잘 나온 색을 기준으로 골라주세요.',
    options: [
      {
        id: 'coralPeach',
        label: '코랄, 피치',
        description: '얼굴에 가볍고 산뜻한 생기가 생겨요.',
      },
      {
        id: 'rosePink',
        label: '로즈, 핑크',
        description: '피부가 맑고 정돈되어 보여요.',
      },
      {
        id: 'roseBrown',
        label: '로즈 브라운, 누드',
        description: '분위기가 차분하고 고급스럽게 보여요.',
      },
      {
        id: 'berryRed',
        label: '베리, 레드',
        description: '입술 포인트가 또렷하고 세련돼 보여요.',
      },
    ],
  },
  {
    id: 'contrast',
    eyebrow: '대비감',
    title: '얼굴에 가장 잘 맞는 선명도는?',
    helper: '헤어, 눈썹, 립 컬러를 떠올리며 골라주세요.',
    options: [
      {
        id: 'softLight',
        label: '밝고 부드러움',
        description: '진한 색보다 옅은 색이 자연스러워요.',
      },
      {
        id: 'lowSoft',
        label: '낮고 차분함',
        description: '선명한 색보다 톤다운된 색이 안정적이에요.',
      },
      {
        id: 'highClear',
        label: '높고 선명함',
        description: '강한 대비를 줘도 얼굴이 밀리지 않아요.',
      },
      {
        id: 'mediumNatural',
        label: '중간 정도',
        description: '너무 옅거나 진한 것보다 균형감이 중요해요.',
      },
    ],
  },
  {
    id: 'impression',
    eyebrow: '이미지 타입',
    title: '가장 자주 듣거나 원하는 분위기는?',
    helper: '얼굴 생김새를 단정하지 않고 스타일링 방향으로만 사용해요.',
    options: [
      {
        id: 'cleanLovely',
        label: '맑고 러블리',
        description: '깨끗하고 산뜻한 분위기가 잘 어울려요.',
      },
      {
        id: 'softNatural',
        label: '부드럽고 내추럴',
        description: '과하지 않은 편안한 분위기가 좋아요.',
      },
      {
        id: 'classicNatural',
        label: '차분하고 클래식',
        description: '정돈된 컬러와 절제된 스타일이 안정적이에요.',
      },
      {
        id: 'chicModern',
        label: '시크하고 모던',
        description: '선명한 라인과 간결한 포인트가 잘 맞아요.',
      },
    ],
  },
  {
    id: 'imageLine',
    eyebrow: '이미지 선',
    title: '얼굴 분위기를 선으로 표현하면 어디에 가까운가요?',
    helper: '정답보다 평소 스타일링했을 때 더 편안한 인상을 골라주세요.',
    options: [
      {
        id: 'roundedSoft',
        label: '둥글고 부드러운 선',
        description: '곡선감과 환한 표정이 잘 살아나요.',
      },
      {
        id: 'balancedClean',
        label: '깔끔하고 균형 잡힌 선',
        description: '정돈된 여백과 맑은 인상이 잘 맞아요.',
      },
      {
        id: 'definedSharp',
        label: '또렷하고 선명한 선',
        description: '눈매, 립 라인처럼 포인트가 선명할 때 좋아요.',
      },
      {
        id: 'calmStraight',
        label: '차분하고 곧은 선',
        description: '과한 곡선보다 단정한 구조감이 안정적이에요.',
      },
    ],
  },
  {
    id: 'imagePace',
    eyebrow: '이미지 리듬',
    title: '스타일링의 전체 리듬은 어느 쪽이 자연스럽나요?',
    helper: '옷, 헤어, 메이크업을 함께 떠올리며 골라주세요.',
    options: [
      {
        id: 'airyFresh',
        label: '가볍고 산뜻함',
        description: '맑은 색과 투명한 표현이 얼굴을 살려요.',
      },
      {
        id: 'relaxedNatural',
        label: '편안하고 자연스러움',
        description: '꾸민 느낌보다 결을 살린 분위기가 잘 맞아요.',
      },
      {
        id: 'refinedClassic',
        label: '정돈되고 클래식함',
        description: '차분한 색과 단정한 실루엣이 안정적이에요.',
      },
      {
        id: 'boldMinimal',
        label: '간결하고 강한 포인트',
        description: '색을 줄이고 한 곳을 또렷하게 잡을 때 세련돼요.',
      },
    ],
  },
  {
    id: 'imageDetail',
    eyebrow: '이미지 디테일',
    title: '메이크업 디테일은 어떤 쪽이 잘 맞나요?',
    helper: '베이스 질감, 립 경계, 눈매 표현을 기준으로 골라주세요.',
    options: [
      {
        id: 'glossyLight',
        label: '얇고 윤기 있게',
        description: '가벼운 광과 산뜻한 생기가 잘 어울려요.',
      },
      {
        id: 'softBlur',
        label: '부드럽게 흐리기',
        description: '경계를 낮추면 인상이 편안하고 자연스러워요.',
      },
      {
        id: 'structuredMatte',
        label: '단정하게 정리하기',
        description: '톤다운 컬러와 깔끔한 마무리가 고급스러워요.',
      },
      {
        id: 'sharpPoint',
        label: '선명한 한 포인트',
        description: '립이나 아이라인 하나를 또렷하게 잡으면 좋아요.',
      },
    ],
  },
  {
    id: 'undertoneClue',
    eyebrow: '언더톤 힌트',
    title: '손목 혈관이나 피부 바탕은 어디에 가까운가요?',
    helper: '조명에 따라 달라질 수 있으니 가장 자주 보이는 느낌을 골라주세요.',
    options: [
      {
        id: 'warmVein',
        label: '초록빛이 도는 편',
        description: '피부 바탕이 따뜻하고 노란기가 편안해 보여요.',
      },
      {
        id: 'coolVein',
        label: '푸른빛이 도는 편',
        description: '차갑고 맑은 색이 피부를 깨끗하게 보여줘요.',
      },
      {
        id: 'neutralVein',
        label: '초록/푸른빛이 섞임',
        description: '웜/쿨보다 밝기와 채도 균형이 더 중요해요.',
      },
      {
        id: 'unclearVein',
        label: '잘 모르겠음',
        description: '피부 단서보다 스타일링 반응을 더 참고할게요.',
      },
    ],
  },
  {
    id: 'sunReaction',
    eyebrow: '햇빛 반응',
    title: '햇빛을 받은 뒤 피부는 보통 어떻게 변하나요?',
    helper: '선크림을 바르지 않았던 경험이나 여름철 반응을 떠올려주세요.',
    options: [
      {
        id: 'goldenTan',
        label: '노릇하게 생기가 돎',
        description: '따뜻한 색감이 피부와 잘 섞여 보여요.',
      },
      {
        id: 'redEasily',
        label: '쉽게 붉어짐',
        description: '차갑고 선명한 색에서 피부가 더 정리돼 보여요.',
      },
      {
        id: 'oliveTan',
        label: '차분하게 그을림',
        description: '낮은 채도와 브라운 계열이 자연스럽게 맞아요.',
      },
      {
        id: 'staysEven',
        label: '큰 변화가 적음',
        description: '색의 온도보다 전체 균형을 보는 편이 좋아요.',
      },
    ],
  },
  {
    id: 'hairTone',
    eyebrow: '헤어 톤',
    title: '가장 얼굴이 편안해 보였던 헤어 컬러는?',
    helper: '염색 경험이 없다면 자연 모발과 잘 맞는 색을 골라주세요.',
    options: [
      {
        id: 'warmBrown',
        label: '따뜻한 브라운',
        description: '피치, 코랄, 베이지와 부드럽게 연결돼요.',
      },
      {
        id: 'ashBrown',
        label: '애쉬 브라운',
        description: '붉은기를 낮추면 피부가 차분해 보여요.',
      },
      {
        id: 'deepBlack',
        label: '딥 블랙',
        description: '강한 대비가 인상을 또렷하게 잡아줘요.',
      },
      {
        id: 'softBlack',
        label: '소프트 블랙',
        description: '너무 밝지 않으면서 자연스러운 균형이 좋아요.',
      },
    ],
  },
  {
    id: 'hairLength',
    eyebrow: '헤어 실루엣',
    title: '어떤 헤어 길이와 실루엣이 가장 자연스럽나요?',
    helper: '얼굴형을 단정하지 않고 평소 스타일링에서 편안했던 느낌만 참고해요.',
    options: [
      {
        id: 'softBob',
        label: '가벼운 보브/단발',
        description: '턱선 주변이 답답하지 않고 산뜻하게 정리돼요.',
      },
      {
        id: 'mediumLayer',
        label: '미디엄 레이어',
        description: '어깨선 주변에 자연스러운 흐름이 생겨요.',
      },
      {
        id: 'sleekLong',
        label: '차분한 롱 헤어',
        description: '긴 선과 윤기가 인상을 깔끔하게 잡아줘요.',
      },
      {
        id: 'shortPoint',
        label: '짧은 포인트 컷',
        description: '목선과 얼굴선이 또렷하게 보일 때 세련돼요.',
      },
    ],
  },
  {
    id: 'hairStyling',
    eyebrow: '헤어 질감',
    title: '헤어 스타일링은 어떤 질감이 잘 맞나요?',
    helper: '볼륨, 컬, 윤기처럼 분위기를 바꾸는 요소를 골라주세요.',
    options: [
      {
        id: 'lightWave',
        label: '가볍고 부드러운 웨이브',
        description: '작은 움직임과 밝은 인상이 잘 살아나요.',
      },
      {
        id: 'naturalAir',
        label: '내추럴한 공기감',
        description: '과한 고정보다 자연스러운 결이 편안해요.',
      },
      {
        id: 'cCurveVolume',
        label: '정돈된 C컬 볼륨',
        description: '단정한 곡선과 깔끔한 볼륨이 안정적이에요.',
      },
      {
        id: 'straightGloss',
        label: '매끈한 스트레이트',
        description: '윤기 있는 직선감이 인상을 선명하게 정리해요.',
      },
    ],
  },
  {
    id: 'hairParting',
    eyebrow: '앞머리/가르마',
    title: '앞머리나 가르마는 어떤 쪽이 가장 편안한가요?',
    helper: '얼굴형 단정이 아니라 평소 사진에서 인상이 잘 사는 방향을 골라주세요.',
    options: [
      {
        id: 'airyBangs',
        label: '가벼운 시스루 앞머리',
        description: '이마를 살짝 보이고 산뜻한 느낌이 잘 살아나요.',
      },
      {
        id: 'curtainBangs',
        label: '자연스러운 커튼뱅',
        description: '얼굴 옆 결이 부드럽게 이어질 때 편안해 보여요.',
      },
      {
        id: 'noBangsSleek',
        label: '앞머리 없이 깔끔하게',
        description: '이마와 얼굴선을 드러낼 때 인상이 또렷해져요.',
      },
      {
        id: 'sidePartVolume',
        label: '사이드 가르마 볼륨',
        description: '한쪽으로 흐르는 볼륨이 단정하고 고급스러워요.',
      },
    ],
  },
  {
    id: 'hairVolume',
    eyebrow: '헤어 볼륨',
    title: '헤어 볼륨은 어느 정도가 가장 자연스럽나요?',
    helper: '정수리, 옆머리, 끝선의 무게감을 함께 떠올려주세요.',
    options: [
      {
        id: 'crownSoftVolume',
        label: '정수리의 자연스러운 볼륨',
        description: '전체적으로 편안한 공기감이 있을 때 좋아요.',
      },
      {
        id: 'sideLightVolume',
        label: '옆선의 가벼운 볼륨',
        description: '얼굴 옆에 작은 움직임이 있으면 생기가 살아나요.',
      },
      {
        id: 'lowCalmVolume',
        label: '낮고 차분한 볼륨',
        description: '부풀림보다 정돈된 흐름이 안정적으로 보여요.',
      },
      {
        id: 'flatSleekLine',
        label: '납작하고 매끈한 라인',
        description: '볼륨을 줄이고 윤기를 남기면 세련돼 보여요.',
      },
    ],
  },
  {
    id: 'bodyFitBalance',
    eyebrow: '체형 밸런스',
    title: '옷을 입었을 때 가장 안정적인 비율은?',
    helper: '정확한 체형 분류보다 사진에서 전체 균형이 좋아 보였던 쪽을 골라주세요.',
    options: [
      {
        id: 'upperLightBalance',
        label: '상체를 가볍게',
        description: '목선과 어깨 주변이 답답하지 않을 때 좋아요.',
      },
      {
        id: 'waistDefinedBalance',
        label: '허리선을 살짝 잡기',
        description: '허리 위치가 보이면 전체 비율이 산뜻해져요.',
      },
      {
        id: 'straightRelaxedBalance',
        label: '일자로 편안하게',
        description: '몸에서 살짝 떨어지는 직선 실루엣이 자연스러워요.',
      },
      {
        id: 'shoulderStructuredBalance',
        label: '어깨선을 선명하게',
        description: '어깨와 세로선이 잡히면 존재감이 살아나요.',
      },
    ],
  },
  {
    id: 'topFit',
    eyebrow: '상의 핏',
    title: '상의는 어떤 핏이 가장 잘 어울렸나요?',
    helper: '티셔츠, 니트, 셔츠, 재킷을 입었을 때의 안정감을 기준으로 골라주세요.',
    options: [
      {
        id: 'fittedRibTop',
        label: '가볍게 붙는 니트/티',
        description: '상체 라인이 부드럽게 보일 때 산뜻해요.',
      },
      {
        id: 'relaxedShirtTop',
        label: '여유 있는 셔츠',
        description: '몸에서 살짝 떨어지는 핏이 편안해 보여요.',
      },
      {
        id: 'croppedJacketTop',
        label: '짧고 깔끔한 재킷',
        description: '상체 길이를 정리하면 전체가 맑고 단정해요.',
      },
      {
        id: 'structuredBlazerTop',
        label: '구조감 있는 블레이저',
        description: '어깨와 라펠이 잡히면 인상이 세련돼 보여요.',
      },
    ],
  },
  {
    id: 'bottomFit',
    eyebrow: '하의 핏',
    title: '하의는 어떤 실루엣이 가장 안정적인가요?',
    helper: '팬츠, 스커트, 원피스 하단의 선을 떠올려주세요.',
    options: [
      {
        id: 'straightDenimBottom',
        label: '스트레이트 데님',
        description: '담백한 직선이 전체를 깨끗하게 정리해요.',
      },
      {
        id: 'wideSlacksBottom',
        label: '여유 있는 와이드 슬랙스',
        description: '부드러운 낙차가 자연스러운 분위기를 살려요.',
      },
      {
        id: 'aLineBottom',
        label: 'A라인 스커트/팬츠',
        description: '밑단으로 살짝 퍼지는 선이 밝고 경쾌해요.',
      },
      {
        id: 'longColumnBottom',
        label: '긴 I라인 하의',
        description: '세로선이 길게 남으면 고급스럽고 또렷해요.',
      },
    ],
  },
  {
    id: 'waistStyling',
    eyebrow: '허리선',
    title: '허리선 연출은 어느 쪽이 더 자연스럽나요?',
    helper: '상의 넣어 입기, 아우터 길이, 벨트 사용감을 떠올려주세요.',
    options: [
      {
        id: 'highWaistLine',
        label: '하이웨이스트로 올리기',
        description: '허리 위치를 올리면 비율이 산뜻해져요.',
      },
      {
        id: 'lowRiseRelaxedLine',
        label: '낮고 편안하게 두기',
        description: '힘을 뺀 무드가 자연스럽게 어울려요.',
      },
      {
        id: 'tuckedCleanLine',
        label: '넣어 입어 정리하기',
        description: '허리와 세로선이 정돈되면 안정적이에요.',
      },
      {
        id: 'untuckedLayerLine',
        label: '빼서 레이어드하기',
        description: '길이 차이를 자연스럽게 남길 때 편안해요.',
      },
    ],
  },
  {
    id: 'fashionSilhouette',
    eyebrow: '패션 실루엣',
    title: '전체 옷 실루엣은 어디에 가까울 때 좋나요?',
    helper: '룩 전체의 선과 여백을 기준으로 골라주세요.',
    options: [
      {
        id: 'softCompactSilhouette',
        label: '작고 부드러운 균형',
        description: '짧은 길이와 작은 디테일이 산뜻해요.',
      },
      {
        id: 'naturalLooseSilhouette',
        label: '자연스러운 루즈핏',
        description: '여유 있는 실루엣이 부담 없이 잘 맞아요.',
      },
      {
        id: 'classicIlineSilhouette',
        label: '단정한 I라인',
        description: '곧은 선과 적당한 길이가 고급스러워요.',
      },
      {
        id: 'modernSharpSilhouette',
        label: '선명한 모던 실루엣',
        description: '간결한 직선과 강한 포인트가 잘 어울려요.',
      },
    ],
  },
  {
    id: 'fashionMood',
    eyebrow: '패션 무드',
    title: '옷차림의 분위기는 어느 쪽이 가장 끌리나요?',
    helper: '평소 입고 싶은 이미지와 실제로 잘 맞았던 이미지를 함께 봐주세요.',
    options: [
      {
        id: 'romanticFreshMood',
        label: '산뜻하고 로맨틱',
        description: '작은 포인트와 밝은 무드가 생기 있어요.',
      },
      {
        id: 'minimalCleanMood',
        label: '깨끗하고 미니멀',
        description: '컬러와 장식을 줄이면 단정해 보여요.',
      },
      {
        id: 'elegantQuietMood',
        label: '차분하고 우아함',
        description: '절제된 소재와 컬러가 고급스럽게 맞아요.',
      },
      {
        id: 'urbanStatementMood',
        label: '도시적이고 강한 포인트',
        description: '하나의 선명한 포인트가 이미지를 또렷하게 만들어요.',
      },
    ],
  },
  {
    id: 'patternScale',
    eyebrow: '패턴 크기',
    title: '패턴이나 장식 크기는 어느 정도가 편안한가요?',
    helper: '얼굴 가까이에 오는 패턴이 인상을 살리는지 기준으로 골라주세요.',
    options: [
      {
        id: 'smallPrintPattern',
        label: '작고 밝은 패턴',
        description: '잔잔한 디테일이 귀엽고 산뜻하게 보여요.',
      },
      {
        id: 'plainTexturePattern',
        label: '무지와 소재감',
        description: '패턴보다 결이나 질감이 자연스러워요.',
      },
      {
        id: 'stripeCheckPattern',
        label: '스트라이프/체크',
        description: '질서 있는 패턴이 단정한 분위기를 만들어요.',
      },
      {
        id: 'boldGraphicPattern',
        label: '큰 그래픽 포인트',
        description: '큰 패턴도 얼굴 분위기를 해치지 않아요.',
      },
    ],
  },
  {
    id: 'layeringStyle',
    eyebrow: '레이어링',
    title: '레이어링은 어떤 방식이 가장 안정적인가요?',
    helper: '아우터, 이너, 액세서리를 겹쳤을 때의 느낌을 골라주세요.',
    options: [
      {
        id: 'oneToneSetLayer',
        label: '원톤 세트처럼 정리',
        description: '비슷한 색으로 맞추면 깔끔하고 안정적이에요.',
      },
      {
        id: 'lightLayering',
        label: '가벼운 한 겹 더하기',
        description: '얇은 레이어가 산뜻한 움직임을 만들어요.',
      },
      {
        id: 'tailoredLayering',
        label: '재킷 중심으로 단정하게',
        description: '아우터의 선이 전체를 고급스럽게 정리해요.',
      },
      {
        id: 'contrastLayering',
        label: '대비 있는 레이어',
        description: '색이나 길이 차이를 선명하게 줄 때 세련돼요.',
      },
    ],
  },
  {
    id: 'imageKeyword',
    eyebrow: '이미지 키워드',
    title: '가장 얻고 싶은 스타일 키워드는 무엇인가요?',
    helper: '퍼스널 컬러보다 전체 이미지 방향을 잡는 질문이에요.',
    options: [
      {
        id: 'freshFriendlyKeyword',
        label: '상큼하고 친근함',
        description: '밝은 표정과 작은 포인트가 잘 맞아요.',
      },
      {
        id: 'calmGentleKeyword',
        label: '차분하고 부드러움',
        description: '편안하고 자연스러운 여백이 좋아요.',
      },
      {
        id: 'refinedTrustKeyword',
        label: '정돈되고 신뢰감 있음',
        description: '깔끔한 선과 단정한 컬러가 안정적이에요.',
      },
      {
        id: 'boldPresenceKeyword',
        label: '선명한 존재감',
        description: '강한 한 포인트가 이미지를 확실히 만들어줘요.',
      },
    ],
  },
  {
    id: 'occasionStyle',
    eyebrow: '상황 스타일',
    title: '가장 잘 맞추고 싶은 상황 스타일은?',
    helper: '결과 추천에서 실제 활용도를 높이기 위한 질문이에요.',
    options: [
      {
        id: 'dailyCasualOccasion',
        label: '데일리 캐주얼',
        description: '매일 입기 편한 자연스러운 스타일이 필요해요.',
      },
      {
        id: 'officeCleanOccasion',
        label: '오피스/면접',
        description: '단정하고 신뢰감 있는 스타일이 필요해요.',
      },
      {
        id: 'dateSoftOccasion',
        label: '데이트/약속',
        description: '부드럽고 생기 있는 스타일이 필요해요.',
      },
      {
        id: 'eveningPointOccasion',
        label: '모임/촬영',
        description: '사진에서 존재감이 살아나는 포인트가 필요해요.',
      },
    ],
  },
  {
    id: 'eyeContrast',
    eyebrow: '눈매 대비',
    title: '눈동자와 눈썹의 대비감은 어느 쪽인가요?',
    helper: '메이크업을 하지 않은 상태의 인상을 기준으로 골라주세요.',
    options: [
      {
        id: 'softBrown',
        label: '부드러운 브라운',
        description: '자연스럽고 편안한 음영이 잘 어울려요.',
      },
      {
        id: 'clearBrown',
        label: '맑고 밝은 브라운',
        description: '가벼운 생기와 투명한 표현이 좋아요.',
      },
      {
        id: 'deepContrast',
        label: '진하고 또렷함',
        description: '라인과 포인트를 선명하게 잡아도 잘 받아요.',
      },
      {
        id: 'mutedGray',
        label: '차분하고 낮은 대비',
        description: '부드러운 로즈/브라운 음영이 안정적이에요.',
      },
    ],
  },
  {
    id: 'colorSaturation',
    eyebrow: '채도',
    title: '얼굴에 잘 맞는 색의 진하기는?',
    helper: '상의나 립 컬러를 바꿨을 때 가장 안정적인 쪽을 골라주세요.',
    options: [
      {
        id: 'lightClear',
        label: '밝고 맑은 색',
        description: '색이 가벼울수록 표정이 환해 보여요.',
      },
      {
        id: 'mutedSoft',
        label: '탁하지 않은 저채도',
        description: '은은하고 부드러운 색이 인상을 정리해요.',
      },
      {
        id: 'deepRich',
        label: '깊고 진한 색',
        description: '한 가지 포인트 컬러가 얼굴을 또렷하게 해요.',
      },
      {
        id: 'neutralBalanced',
        label: '중간 채도',
        description: '너무 맑거나 진한 색보다 균형감이 중요해요.',
      },
    ],
  },
  {
    id: 'patternMood',
    eyebrow: '패턴 무드',
    title: '옷의 패턴이나 디테일은 어떤 쪽이 잘 맞나요?',
    helper: '평소 사진에서 얼굴과 스타일이 함께 좋아 보이는 쪽을 골라주세요.',
    options: [
      {
        id: 'delicateDetail',
        label: '작고 섬세한 디테일',
        description: '가벼운 포인트가 러블리한 이미지를 살려요.',
      },
      {
        id: 'naturalTexture',
        label: '내추럴한 질감',
        description: '꾸민 듯 안 꾸민 듯한 편안함이 잘 맞아요.',
      },
      {
        id: 'classicTailored',
        label: '단정한 테일러드',
        description: '정돈된 선과 클래식한 분위기가 안정적이에요.',
      },
      {
        id: 'minimalStatement',
        label: '미니멀한 한 포인트',
        description: '여백을 두고 강한 포인트 하나를 주면 좋아요.',
      },
    ],
  },
  {
    id: 'accessoryScale',
    eyebrow: '액세서리 크기',
    title: '얼굴 가까이 오는 액세서리 크기는?',
    helper: '귀걸이, 목걸이, 안경테처럼 얼굴 인상을 바꾸는 요소를 떠올려주세요.',
    options: [
      {
        id: 'smallSoft',
        label: '작고 부드러운 포인트',
        description: '섬세한 크기가 얼굴의 맑은 느낌을 해치지 않아요.',
      },
      {
        id: 'mediumClean',
        label: '깔끔한 중간 크기',
        description: '너무 작거나 크지 않은 균형이 자연스러워요.',
      },
      {
        id: 'refinedSimple',
        label: '절제된 심플 포인트',
        description: '단정하고 고급스러운 분위기를 만들어줘요.',
      },
      {
        id: 'boldSharp',
        label: '큰 포인트도 소화',
        description: '선명한 형태가 얼굴의 존재감을 살려요.',
      },
    ],
  },
  {
    id: 'fabricTexture',
    eyebrow: '소재감',
    title: '옷 소재는 어떤 질감이 얼굴과 잘 어울리나요?',
    helper: '메이크업 질감과도 연결되는 단서예요.',
    options: [
      {
        id: 'sheerGlossy',
        label: '가볍고 윤기 있는 소재',
        description: '투명한 광과 산뜻한 색감이 잘 맞아요.',
      },
      {
        id: 'softCotton',
        label: '부드러운 코튼/니트',
        description: '편안하고 자연스러운 결이 인상을 살려요.',
      },
      {
        id: 'suedeMatte',
        label: '차분한 스웨이드/매트',
        description: '톤다운된 깊이와 클래식한 질감이 좋아요.',
      },
      {
        id: 'crispLeather',
        label: '선명한 레더/새틴',
        description: '간결하고 강한 질감이 세련되게 맞아요.',
      },
    ],
  },
  {
    id: 'browLine',
    eyebrow: '눈썹 라인',
    title: '눈썹은 어떤 형태가 가장 편안한가요?',
    helper: '인상이 과하지 않게 정리되는 형태를 골라주세요.',
    options: [
      {
        id: 'softArch',
        label: '부드러운 아치',
        description: '곡선감이 얼굴을 밝고 부드럽게 보여줘요.',
      },
      {
        id: 'straightNatural',
        label: '자연스러운 일자',
        description: '편안하고 담백한 분위기가 살아나요.',
      },
      {
        id: 'cleanArch',
        label: '정돈된 세미 아치',
        description: '단정한 구조감이 얼굴을 깔끔하게 잡아줘요.',
      },
      {
        id: 'sharpDefined',
        label: '또렷한 각도',
        description: '선명한 인상과 모던한 분위기가 잘 맞아요.',
      },
    ],
  },
  {
    id: 'lipBoundary',
    eyebrow: '립 경계',
    title: '립 표현은 어떤 방식이 가장 안정적인가요?',
    helper: '평소 자주 바르는 립의 경계감과 질감을 기준으로 골라주세요.',
    options: [
      {
        id: 'blurTint',
        label: '부드럽게 번진 틴트',
        description: '경계가 낮을수록 편안하고 자연스러워요.',
      },
      {
        id: 'glossTint',
        label: '맑고 촉촉한 틴트',
        description: '광택과 생기가 얼굴을 환하게 보여줘요.',
      },
      {
        id: 'satinNatural',
        label: '차분한 새틴 립',
        description: '정돈된 색감과 적당한 윤기가 안정적이에요.',
      },
      {
        id: 'clearFull',
        label: '선명한 풀립',
        description: '립 라인을 또렷하게 잡아도 인상이 살아나요.',
      },
    ],
  },
  {
    id: 'overallPreference',
    eyebrow: '최종 무드',
    title: '가장 끌리는 전체 스타일 방향은?',
    helper: '퍼스널 컬러와 이미지 타입을 함께 정리하는 마지막 질문이에요.',
    options: [
      {
        id: 'warmFresh',
        label: '따뜻하고 산뜻한 무드',
        description: '피치, 코랄, 투명한 윤광이 좋아요.',
      },
      {
        id: 'coolClean',
        label: '차갑고 깨끗한 무드',
        description: '로즈, 라벤더, 맑은 베이스가 좋아요.',
      },
      {
        id: 'earthyElegant',
        label: '차분하고 우아한 무드',
        description: '브라운, 베이지, 낮은 채도의 깊이가 좋아요.',
      },
      {
        id: 'statementChic',
        label: '선명하고 시크한 무드',
        description: '블랙, 버건디, 또렷한 라인이 좋아요.',
      },
    ],
  },
] as const;

type DetailedQuestionSeed = {
  eyebrow: string;
  helper: string;
  id: string;
  optionSet: DetailedQuestionOptionSetName;
  title: string;
  unknownGuide?: string;
};

type DetailedQuestionOptionSetName =
  | 'accessoryShape'
  | 'baseFinish'
  | 'bodyBalance'
  | 'colorTemperature'
  | 'fashionFit'
  | 'faceShapeBalance'
  | 'hairDirection'
  | 'imageMood'
  | 'lipCheek'
  | 'patternTexture';

const detailedQuestionOptionSets = {
  accessoryShape: [
    {
      description: '작고 둥근 장식이 얼굴의 부드러운 느낌을 살려줘요.',
      id: 'detailAccessoryRoundSmall',
      label: '작고 둥근 포인트',
      score: {faceImage: {lovely: 1, soft: 1}, style: {lightRomantic: 1}},
    },
    {
      description: '장식이 거의 없는 형태가 깨끗하고 단정해 보여요.',
      id: 'detailAccessoryMinimalClean',
      label: '미니멀한 직선 포인트',
      score: {faceImage: {clean: 1, modern: 1}, style: {cleanMinimal: 1}},
    },
    {
      description: '정돈된 금속감과 적당한 크기가 클래식한 분위기에 잘 맞아요.',
      id: 'detailAccessoryClassicMetal',
      label: '클래식한 금속 포인트',
      score: {faceImage: {classic: 1}, style: {classicTailoredFit: 1}},
    },
    {
      description: '선명한 형태 하나가 전체 이미지를 또렷하게 잡아줘요.',
      id: 'detailAccessoryBoldLine',
      label: '큰 직선 포인트',
      score: {faceImage: {chic: 1, modern: 1}, style: {urbanStatementFit: 1}},
    },
  ],
  baseFinish: [
    {
      description: '얇은 윤광과 맑은 생기가 얼굴을 환하게 보여줘요.',
      id: 'detailBaseClearGlow',
      label: '얇은 윤광',
      score: {depth: {light: 1}, faceImage: {clean: 1}, season: {springWarm: 1}},
    },
    {
      description: '보송하지만 건조하지 않은 마무리가 피부를 차분하게 정리해요.',
      id: 'detailBaseSoftSemiMatte',
      label: '소프트 세미매트',
      score: {depth: {mute: 1, soft: 1}, faceImage: {soft: 1}, season: {summerCool: 1}},
    },
    {
      description: '결을 정돈한 매트 표현이 고급스럽고 안정적으로 보여요.',
      id: 'detailBaseStructuredMatte',
      label: '정돈된 매트',
      score: {depth: {mute: 1}, faceImage: {classic: 1}, season: {autumnWarm: 1}},
    },
    {
      description: '밝기 차이를 깨끗하게 잡으면 선명한 인상이 살아나요.',
      id: 'detailBaseHighContrastClean',
      label: '균일하고 선명한 베이스',
      score: {depth: {clear: 1, deep: 1}, faceImage: {chic: 1}, season: {winterCool: 1}},
    },
  ],
  bodyBalance: [
    {
      description: '목선과 어깨 주변을 가볍게 두면 전체 비율이 답답하지 않아 보여요.',
      id: 'detailBodyUpperLight',
      label: '상체를 가볍게',
      score: {faceImage: {clean: 1, lovely: 1}, style: {cleanMinimal: 1, lightRomantic: 1}},
    },
    {
      description: '허리 위치나 곡선을 살짝 잡으면 몸의 중심이 산뜻하게 정리돼요.',
      id: 'detailBodyWaistShape',
      label: '허리 중심 살리기',
      score: {faceImage: {classic: 1, lovely: 1}, style: {classicTailoredFit: 1, lightRomantic: 1}},
    },
    {
      description: '몸에서 살짝 떨어지는 직선 여유가 자연스럽고 편안한 균형을 만들어요.',
      id: 'detailBodyRelaxedStraight',
      label: '편안한 직선 여유',
      score: {faceImage: {natural: 1, soft: 1}, style: {softCasual: 2}},
    },
    {
      description: '어깨선과 긴 세로선을 분명히 잡으면 전체 존재감이 또렷해져요.',
      id: 'detailBodyStructuredLine',
      label: '구조적인 세로선',
      score: {faceImage: {chic: 1, modern: 1}, style: {urbanStatementFit: 2}},
    },
  ],
  colorTemperature: [
    {
      description: '따뜻한 피치빛이 얼굴에 생기를 더해줘요.',
      id: 'detailColorWarmPeach',
      label: '따뜻한 피치',
      score: {depth: {light: 1}, faceImage: {lovely: 1}, season: {springWarm: 2}},
    },
    {
      description: '차가운 로즈빛이 피부를 맑고 깨끗하게 보여줘요.',
      id: 'detailColorCoolRose',
      label: '차가운 로즈',
      score: {depth: {light: 1, mute: 1}, faceImage: {soft: 1}, season: {summerCool: 2}},
    },
    {
      description: '브라운과 카멜 계열이 분위기를 차분하게 잡아줘요.',
      id: 'detailColorMutedBrown',
      label: '톤다운 브라운',
      score: {depth: {mute: 2}, faceImage: {classic: 1}, season: {autumnWarm: 2}},
    },
    {
      description: '블랙, 버건디, 화이트 대비가 인상을 또렷하게 만들어요.',
      id: 'detailColorCoolContrast',
      label: '선명한 쿨 대비',
      score: {depth: {clear: 1, deep: 1}, faceImage: {chic: 1}, season: {winterCool: 2}},
    },
  ],
  fashionFit: [
    {
      description: '허리선과 짧은 길이가 산뜻하고 러블리한 균형을 만들어요.',
      id: 'detailFashionLightWaist',
      label: '가벼운 허리선',
      score: {faceImage: {lovely: 1}, style: {lightRomantic: 2}},
    },
    {
      description: '몸에서 살짝 떨어지는 여유가 자연스럽고 편안해 보여요.',
      id: 'detailFashionRelaxedNatural',
      label: '편안한 여유핏',
      score: {faceImage: {natural: 1, soft: 1}, style: {softCasual: 2}},
    },
    {
      description: '어깨와 허리선이 정리되면 신뢰감 있는 인상이 살아나요.',
      id: 'detailFashionTailored',
      label: '단정한 테일러드',
      score: {faceImage: {classic: 1}, style: {classicTailoredFit: 2}},
    },
    {
      description: '긴 세로선과 구조적인 핏이 도시적인 존재감을 만들어줘요.',
      id: 'detailFashionUrbanLine',
      label: '긴 직선 실루엣',
      score: {faceImage: {chic: 1, modern: 1}, style: {urbanStatementFit: 2}},
    },
  ],
  faceShapeBalance: [
    {
      description: '턱선과 볼 주변에 부드러운 여백을 남기면 인상이 밝고 편안해 보여요.',
      id: 'detailFaceSoftCurve',
      label: '부드러운 곡선형',
      score: {faceImage: {lovely: 1, soft: 1}, hair: {softLayeredBob: 1}, style: {lightRomantic: 1}},
    },
    {
      description: '이마, 광대, 턱선의 균형이 고르게 보일 때 담백하고 깨끗한 인상이 살아요.',
      id: 'detailFaceBalancedOval',
      label: '균형 잡힌 타원형',
      score: {faceImage: {clean: 1, natural: 1}, hair: {naturalLayeredMedium: 1}, style: {cleanMinimal: 1}},
    },
    {
      description: '광대나 턱선의 각을 살리면 시크하고 선명한 이미지가 더 또렷해져요.',
      id: 'detailFaceDefinedAngle',
      label: '또렷한 각진형',
      score: {faceImage: {chic: 1, modern: 1}, hair: {sleekStraightLong: 1}, style: {urbanStatementFit: 1}},
    },
    {
      description: '세로감과 차분한 옆선을 정돈하면 클래식하고 단정한 분위기가 살아요.',
      id: 'detailFaceLongClassic',
      label: '세로감 있는 클래식형',
      score: {faceImage: {classic: 1, soft: 1}, hair: {classicCcurveMedium: 1}, style: {classicTailoredFit: 1}},
    },
  ],
  hairDirection: [
    {
      description: '가벼운 길이와 작은 움직임이 맑고 산뜻한 이미지를 살려요.',
      id: 'detailHairSoftBobWave',
      label: '가벼운 보브 웨이브',
      score: {faceImage: {clean: 1, lovely: 1}, hair: {softLayeredBob: 2}},
    },
    {
      description: '자연스러운 층과 공기감이 편안한 분위기를 만들어줘요.',
      id: 'detailHairNaturalLayer',
      label: '내추럴 레이어',
      score: {faceImage: {natural: 1, soft: 1}, hair: {naturalLayeredMedium: 2}},
    },
    {
      description: '정돈된 C컬과 낮은 볼륨이 차분한 인상을 고급스럽게 잡아요.',
      id: 'detailHairClassicCcurve',
      label: '정돈된 C컬',
      score: {faceImage: {classic: 1}, hair: {classicCcurveMedium: 2}},
    },
    {
      description: '윤기 있는 직선감이 시크하고 모던한 이미지를 강조해요.',
      id: 'detailHairSleekLine',
      label: '슬릭한 직선',
      score: {faceImage: {chic: 1, modern: 1}, hair: {sleekStraightLong: 2}},
    },
  ],
  imageMood: [
    {
      description: '작은 곡선과 밝은 포인트가 친근하고 사랑스러운 이미지를 만들어요.',
      id: 'detailImageLovelyFresh',
      label: '상큼하고 러블리',
      score: {depth: {light: 1}, faceImage: {clean: 1, lovely: 2}, style: {lightRomantic: 1}},
    },
    {
      description: '경계를 낮춘 표현과 부드러운 소재가 편안한 이미지를 살려요.',
      id: 'detailImageSoftNatural',
      label: '부드럽고 내추럴',
      score: {depth: {soft: 1}, faceImage: {natural: 2, soft: 1}, style: {softCasual: 1}},
    },
    {
      description: '절제된 색과 정돈된 선이 차분하고 신뢰감 있는 인상을 만들어요.',
      id: 'detailImageClassicTrust',
      label: '차분하고 클래식',
      score: {depth: {mute: 1}, faceImage: {classic: 2}, style: {classicTailoredFit: 1}},
    },
    {
      description: '여백과 강한 한 포인트가 시크한 존재감을 또렷하게 보여줘요.',
      id: 'detailImageChicModern',
      label: '시크하고 모던',
      score: {depth: {clear: 1, deep: 1}, faceImage: {chic: 2, modern: 1}, style: {urbanStatementFit: 1}},
    },
  ],
  lipCheek: [
    {
      description: '코랄과 피치가 혈색을 맑고 산뜻하게 보여줘요.',
      id: 'detailLipCheekCoral',
      label: '코랄/피치 생기',
      score: {depth: {light: 1}, faceImage: {lovely: 1}, season: {springWarm: 2}},
    },
    {
      description: '로즈와 핑크가 피부를 깨끗하고 부드럽게 정리해요.',
      id: 'detailLipCheekRose',
      label: '로즈/핑크 정돈감',
      score: {depth: {mute: 1}, faceImage: {soft: 1}, season: {summerCool: 2}},
    },
    {
      description: '로즈 브라운과 누드 톤이 깊이와 우아함을 만들어줘요.',
      id: 'detailLipCheekBrown',
      label: '로즈 브라운 깊이',
      score: {depth: {mute: 2}, faceImage: {classic: 1}, season: {autumnWarm: 2}},
    },
    {
      description: '베리와 레드 포인트가 인상을 선명하고 세련되게 잡아요.',
      id: 'detailLipCheekBerry',
      label: '베리/레드 포인트',
      score: {depth: {clear: 1, deep: 1}, faceImage: {chic: 1}, season: {winterCool: 2}},
    },
  ],
  patternTexture: [
    {
      description: '작고 밝은 디테일이 얼굴의 산뜻한 분위기를 해치지 않아요.',
      id: 'detailPatternSmallLight',
      label: '작고 밝은 디테일',
      score: {faceImage: {lovely: 1}, style: {lightRomantic: 1}},
    },
    {
      description: '부드러운 코튼과 니트 질감이 편안한 이미지를 살려요.',
      id: 'detailPatternNaturalTexture',
      label: '내추럴한 소재감',
      score: {faceImage: {natural: 1, soft: 1}, style: {softCasual: 1}},
    },
    {
      description: '체크, 스트라이프처럼 질서 있는 패턴이 단정하게 맞아요.',
      id: 'detailPatternClassicOrder',
      label: '질서 있는 패턴',
      score: {faceImage: {classic: 1}, style: {classicTailoredFit: 1}},
    },
    {
      description: '큰 그래픽이나 선명한 소재 대비가 모던한 포인트가 돼요.',
      id: 'detailPatternBoldContrast',
      label: '큰 포인트 패턴',
      score: {faceImage: {chic: 1, modern: 1}, style: {urbanStatementFit: 1}},
    },
  ],
} as const satisfies Record<string, readonly LocalBeautySurveyOption[]>;

const detailedQuestionSeeds: readonly DetailedQuestionSeed[] = [
  {id: 'detailNaturalLightSkin', eyebrow: '컬러 세부', title: '자연광에서 얼굴이 가장 맑아 보이는 색감은?', helper: '창가 자연광에서 상의나 수건을 얼굴 가까이에 대고 비교해보세요.', optionSet: 'colorTemperature'},
  {id: 'detailIndoorSkin', eyebrow: '컬러 세부', title: '실내 조명에서도 안정적으로 보이는 색감은?', helper: '노란 조명과 흰 조명 사진을 함께 떠올려보세요.', optionSet: 'colorTemperature'},
  {id: 'detailWhiteBalance', eyebrow: '컬러 세부', title: '흰 상의를 입었을 때 얼굴 반응은?', helper: '완전한 흰색과 아이보리 중 어느 쪽이 덜 떠 보였는지 확인해보세요.', optionSet: 'colorTemperature'},
  {id: 'detailBlackBalance', eyebrow: '컬러 세부', title: '검정 상의를 입었을 때 인상은?', helper: '얼굴이 또렷해지는지, 색이 너무 무거워지는지 비교해보세요.', optionSet: 'colorTemperature'},
  {id: 'detailPastelReaction', eyebrow: '컬러 세부', title: '파스텔 컬러를 입었을 때 얼굴은?', helper: '라벤더, 민트, 연핑크처럼 밝은 색에서 피부가 맑아지는지 봐주세요.', optionSet: 'colorTemperature'},
  {id: 'detailEarthReaction', eyebrow: '컬러 세부', title: '카멜/올리브/브라운 계열은 어떤가요?', helper: '얼굴이 안정되는지, 칙칙해지는지 최근 사진 기준으로 골라주세요.', optionSet: 'colorTemperature'},
  {id: 'detailVividReaction', eyebrow: '컬러 세부', title: '선명한 원색을 입었을 때는?', helper: '색이 먼저 보이는지 얼굴까지 또렷해지는지 확인해보세요.', optionSet: 'colorTemperature'},
  {id: 'detailMonochromeReaction', eyebrow: '컬러 세부', title: '흑백 조합을 입었을 때 전체 인상은?', helper: '강한 대비가 얼굴을 살리는지 무겁게 만드는지 떠올려주세요.', optionSet: 'colorTemperature'},
  {id: 'detailBlushArea', eyebrow: '메이크업 세부', title: '블러셔 면적은 어느 쪽이 안정적인가요?', helper: '넓게 퍼뜨렸을 때와 좁게 올렸을 때 사진 반응을 비교해보세요.', optionSet: 'lipCheek'},
  {id: 'detailLipDepth', eyebrow: '메이크업 세부', title: '립 컬러의 깊이는 어느 정도가 좋은가요?', helper: '틴트 한 번, 두 번, 풀립 사진 중 가장 자연스러운 쪽을 떠올려주세요.', optionSet: 'lipCheek'},
  {id: 'detailEyeShadowDepth', eyebrow: '메이크업 세부', title: '아이섀도 음영은 어떤 쪽이 편안한가요?', helper: '밝은 베이스, 은은한 음영, 깊은 음영, 또렷한 라인 중 안정적인 쪽을 골라주세요.', optionSet: 'baseFinish'},
  {id: 'detailBaseLongevity', eyebrow: '메이크업 세부', title: '시간이 지나도 덜 무너져 보이는 베이스는?', helper: '외출 후 사진에서 광, 보송함, 매트함 중 어느 표현이 유지됐는지 봐주세요.', optionSet: 'baseFinish'},
  {id: 'detailMakeupBoundary', eyebrow: '메이크업 세부', title: '메이크업 경계감은 어디까지 괜찮나요?', helper: '립 라인, 아이라인, 블러셔 경계가 보일 때의 인상을 비교해보세요.', optionSet: 'baseFinish'},
  {id: 'detailHighlightReaction', eyebrow: '메이크업 세부', title: '하이라이터나 광 표현은 얼마나 어울리나요?', helper: '콧대, 광대, 눈밑 광이 얼굴을 살리는지 번들거려 보이는지 떠올려주세요.', optionSet: 'baseFinish'},
  {id: 'detailHairFaceFrame', eyebrow: '헤어 세부', title: '얼굴 옆머리 연출은 어떤 쪽이 좋은가요?', helper: '얼굴 옆 라인을 가렸을 때와 드러냈을 때 인상을 비교해보세요.', optionSet: 'hairDirection'},
  {id: 'detailHairEnds', eyebrow: '헤어 세부', title: '머리 끝선은 어떤 방향이 자연스럽나요?', helper: '안쪽 C컬, 자연스러운 층, 직선 끝선, 짧은 포인트 중 골라주세요.', optionSet: 'hairDirection'},
  {id: 'detailHairBangWeight', eyebrow: '헤어 세부', title: '앞머리 무게감은 어느 정도가 편안한가요?', helper: '앞머리를 내린 사진과 넘긴 사진을 비교해보세요.', optionSet: 'hairDirection'},
  {id: 'detailHairShine', eyebrow: '헤어 세부', title: '모발 윤기 표현은 어느 쪽이 잘 맞나요?', helper: '매끈한 윤기, 자연스러운 결, 낮은 볼륨, 산뜻한 움직임 중 골라주세요.', optionSet: 'hairDirection'},
  {id: 'detailHairColorBrightness', eyebrow: '헤어 세부', title: '헤어 컬러 밝기는 어느 정도가 좋았나요?', helper: '염색 경험이 없다면 자연 모발과 얼굴 대비를 기준으로 골라주세요.', optionSet: 'colorTemperature'},
  {id: 'detailHairMaintenance', eyebrow: '헤어 세부', title: '아침 손질 난이도는 어느 정도가 편한가요?', helper: '손질 시간이 길어도 괜찮은지, 빠르게 정리되는 쪽이 좋은지 기준으로 골라주세요.', optionSet: 'hairDirection'},
  {id: 'detailHairTieUp', eyebrow: '헤어 세부', title: '머리를 묶거나 넘겼을 때 원하는 느낌은?', helper: '묶은 머리, 귀 뒤로 넘김, 반묶음처럼 자주 하는 상황을 떠올려주세요.', optionSet: 'hairDirection'},
  {id: 'detailHairColorCommitment', eyebrow: '헤어 세부', title: '헤어 컬러 변화 폭은 어느 정도가 부담 없나요?', helper: '크게 바꾸는 염색, 은은한 톤 보정, 자연 모발 유지 중 편한 방향을 골라주세요.', optionSet: 'colorTemperature'},
  {id: 'detailHairTextureCare', eyebrow: '헤어 세부', title: '모발 질감 관리는 어떤 방식이 잘 맞나요?', helper: '오일 윤기, 에어리 볼륨, 차분한 정리, 가벼운 움직임 중 유지하기 편한 쪽을 골라주세요.', optionSet: 'hairDirection'},
  {id: 'detailFaceShapeJaw', eyebrow: '얼굴형 세부', title: '턱선은 어떤 연출에서 가장 편안해 보이나요?', helper: '정면 사진에서 턱선을 드러냈을 때와 머리카락으로 살짝 감쌌을 때를 비교해보세요.', optionSet: 'faceShapeBalance'},
  {id: 'detailFaceShapeCheekbone', eyebrow: '얼굴형 세부', title: '광대와 볼 중심은 어떤 표현이 안정적인가요?', helper: '광대를 밝히는 스타일, 옆머리로 감싸는 스타일, 선을 살리는 스타일을 떠올려주세요.', optionSet: 'faceShapeBalance'},
  {id: 'detailFaceShapeLength', eyebrow: '얼굴형 세부', title: '얼굴 길이감은 어떤 균형이 좋나요?', helper: '앞머리, 가르마, 목선 노출에 따라 얼굴이 길어 보이는지 짧아 보이는지 비교해보세요.', optionSet: 'faceShapeBalance'},
  {id: 'detailFaceShapeForehead', eyebrow: '얼굴형 세부', title: '이마를 드러냈을 때 인상은 어떤가요?', helper: '이마를 보이는 사진과 앞머리가 있는 사진에서 표정과 비율이 편한 쪽을 봐주세요.', optionSet: 'faceShapeBalance'},
  {id: 'detailFaceShapeWidth', eyebrow: '얼굴형 세부', title: '얼굴 폭은 어떤 스타일에서 균형이 맞나요?', helper: '옆머리 볼륨, 귀 뒤 넘김, 큰 액세서리, 네크라인에 따라 얼굴 폭이 편한 쪽을 골라주세요.', optionSet: 'faceShapeBalance'},
  {id: 'detailFaceShapeSideLine', eyebrow: '얼굴형 세부', title: '옆모습 라인은 어떤 느낌이 잘 맞나요?', helper: '코, 입술, 턱선의 옆 라인이 부드러워 보이는지 또렷해 보이는지 최근 사진으로 확인해보세요.', optionSet: 'faceShapeBalance'},
  {id: 'detailFaceShapePhotoAngle', eyebrow: '얼굴형 세부', title: '사진 각도는 어느 쪽에서 얼굴이 잘 살아나요?', helper: '정면, 살짝 측면, 위에서 찍은 사진, 아래에서 찍은 사진 중 안정적인 각도를 비교해보세요.', optionSet: 'faceShapeBalance'},
  {id: 'detailFaceShapeNeckLine', eyebrow: '얼굴형 세부', title: '목선과 얼굴 하단 연결은 어떤 쪽이 자연스럽나요?', helper: '목을 드러내는 옷과 감싸는 옷, 짧은 머리와 긴 머리의 차이를 떠올려주세요.', optionSet: 'faceShapeBalance'},
  {id: 'detailFaceShapeHairVolume', eyebrow: '얼굴형 세부', title: '얼굴 주변 헤어 볼륨은 어느 위치가 좋나요?', helper: '정수리, 광대 옆, 턱선 아래, 볼륨을 줄인 스타일 중 얼굴이 편한 쪽을 비교해보세요.', optionSet: 'faceShapeBalance'},
  {id: 'detailFaceShapeAccessoryBalance', eyebrow: '얼굴형 세부', title: '얼굴형과 액세서리 크기는 어떤 균형이 맞나요?', helper: '작은 귀걸이, 긴 귀걸이, 둥근 장식, 각진 장식이 얼굴선과 어떻게 맞는지 봐주세요.', optionSet: 'faceShapeBalance'},
  {id: 'detailFaceShapeBangsBalance', eyebrow: '얼굴형 세부', title: '앞머리로 얼굴 비율을 조절한다면 어떤 쪽이 낫나요?', helper: '시스루, 커튼뱅, 풀뱅, 앞머리 없음 중 얼굴 길이와 폭이 편한 쪽을 떠올려주세요.', optionSet: 'faceShapeBalance'},
  {id: 'detailFaceShapeContourNeed', eyebrow: '얼굴형 세부', title: '쉐딩이나 하이라이트는 어느 정도가 자연스럽나요?', helper: '턱선, 광대, 콧대, 이마 음영을 넣었을 때 얼굴이 답답하지 않은 정도를 골라주세요.', optionSet: 'faceShapeBalance'},
  {id: 'detailBodyShoulderHipBalance', eyebrow: '체형 세부', title: '어깨와 골반의 균형은 어떤 옷에서 편안한가요?', helper: '어깨선을 잡는 상의, 허리를 잡는 하의, 일자 실루엣, 긴 세로선 중 안정적인 쪽을 골라주세요.', optionSet: 'bodyBalance'},
  {id: 'detailBodyTorsoLength', eyebrow: '체형 세부', title: '상체 길이는 어떤 연출에서 비율이 좋아 보이나요?', helper: '크롭, 하이웨이스트, 긴 셔츠, 재킷 길이에 따라 상체가 답답해 보이는지 비교해보세요.', optionSet: 'bodyBalance'},
  {id: 'detailBodyWaistCurve', eyebrow: '체형 세부', title: '허리 곡선은 얼마나 드러내는 게 편한가요?', helper: '벨트, 넣어 입기, 원피스 절개선, 루즈핏 중 몸의 중심이 잘 잡히는 쪽을 봐주세요.', optionSet: 'bodyBalance'},
  {id: 'detailBodyLegLine', eyebrow: '체형 세부', title: '다리 라인은 어떤 하의에서 안정적인가요?', helper: '스트레이트, 와이드, A라인, 롱 스커트처럼 하체 선이 다르게 보이는 사진을 비교해보세요.', optionSet: 'bodyBalance'},
  {id: 'detailBodyArmShoulderFit', eyebrow: '체형 세부', title: '팔과 어깨 주변 핏은 어떤 쪽이 좋나요?', helper: '민소매, 반팔 소매 길이, 드롭숄더, 재킷 어깨선에서 상체가 편한 쪽을 골라주세요.', optionSet: 'bodyBalance'},
  {id: 'detailBodyHipVolume', eyebrow: '체형 세부', title: '골반과 힙 주변 볼륨은 어떻게 잡는 게 좋나요?', helper: '붙는 하의, 여유 있는 하의, A라인, 긴 아우터를 입었을 때 균형을 비교해보세요.', optionSet: 'bodyBalance'},
  {id: 'detailBodyOuterVolume', eyebrow: '체형 세부', title: '아우터 부피는 어느 정도가 안정적인가요?', helper: '얇은 가디건, 짧은 재킷, 긴 코트, 구조적인 아우터 중 전체 비율이 편한 쪽을 골라주세요.', optionSet: 'bodyBalance'},
  {id: 'detailBodyShoeBalance', eyebrow: '체형 세부', title: '신발 무게감은 전체 비율에 어떤 영향을 주나요?', helper: '가벼운 플랫, 스니커즈, 로퍼, 굽 있는 신발 중 하체와 전체 실루엣이 안정적인 쪽을 봐주세요.', optionSet: 'bodyBalance'},
  {id: 'detailBodyLayerBreak', eyebrow: '체형 세부', title: '레이어링으로 몸의 선을 끊는 위치는 어디가 좋나요?', helper: '허리, 골반, 허벅지, 무릎 아래에서 옷 길이가 끊길 때 비율을 비교해보세요.', optionSet: 'bodyBalance'},
  {id: 'detailBodyBagPosition', eyebrow: '체형 세부', title: '가방 위치는 어느 높이가 전체 균형에 맞나요?', helper: '짧은 숄더백, 크로스백, 토트백, 미니백을 들었을 때 시선이 어디에 모이는지 확인해보세요.', optionSet: 'bodyBalance'},
  {id: 'detailTopNeckline', eyebrow: '패션 세부', title: '상의 네크라인은 어떤 쪽이 편안한가요?', helper: '목선이 답답해 보이는지, 얼굴이 길어 보이는지 사진으로 비교해보세요.', optionSet: 'fashionFit'},
  {id: 'detailShoulderLine', eyebrow: '패션 세부', title: '어깨선은 어느 정도 잡히는 게 좋나요?', helper: '드롭숄더, 정어깨, 재킷 어깨선을 입었을 때 비율을 떠올려주세요.', optionSet: 'fashionFit'},
  {id: 'detailOuterLength', eyebrow: '패션 세부', title: '아우터 길이는 어떤 쪽이 안정적인가요?', helper: '짧은 재킷, 미디엄 셔츠, 긴 코트 사진 중 균형이 좋은 쪽을 골라주세요.', optionSet: 'fashionFit'},
  {id: 'detailPantsRise', eyebrow: '패션 세부', title: '팬츠 밑위와 허리 위치는?', helper: '하이웨이스트, 로우라이즈, 넣어 입기, 빼 입기 중 편안한 쪽을 봐주세요.', optionSet: 'fashionFit'},
  {id: 'detailSkirtShape', eyebrow: '패션 세부', title: '스커트나 원피스 하단은 어떤 선이 좋은가요?', helper: 'A라인, H라인, 여유 있는 직선, 강한 세로선 중 안정적인 쪽을 골라주세요.', optionSet: 'fashionFit'},
  {id: 'detailFashionComfort', eyebrow: '패션 세부', title: '오래 입어도 부담 없는 옷의 여유는?', helper: '앉고 걷고 일할 때 덜 신경 쓰이는 핏을 기준으로 골라주세요.', optionSet: 'fashionFit'},
  {id: 'detailFashionDailyBase', eyebrow: '패션 세부', title: '자주 손이 가는 기본 아이템은?', helper: '니트, 셔츠, 재킷, 슬랙스처럼 실제로 자주 입는 조합을 떠올려주세요.', optionSet: 'fashionFit'},
  {id: 'detailFashionPointBalance', eyebrow: '패션 세부', title: '포인트 아이템은 어디에 두는 게 편한가요?', helper: '상의, 아우터, 액세서리, 패턴 중 하나만 강조했을 때 부담이 적은 쪽을 골라주세요.', optionSet: 'patternTexture'},
  {id: 'detailFashionSeasonLayer', eyebrow: '패션 세부', title: '계절 레이어링은 어떤 방식이 편한가요?', helper: '얇게 겹치기, 재킷으로 정리하기, 소재감으로 깊이 주기, 대비를 주기 중 골라주세요.', optionSet: 'patternTexture'},
  {id: 'detailLayerContrast', eyebrow: '스타일링 세부', title: '레이어링의 색 대비는 어느 정도가 좋나요?', helper: '비슷한 톤 조합과 강한 대비 조합을 비교해보세요.', optionSet: 'patternTexture'},
  {id: 'detailTextureWeight', eyebrow: '스타일링 세부', title: '소재 두께감은 어느 쪽이 어울리나요?', helper: '쉬폰, 코튼, 울/스웨이드, 레더/새틴 중 얼굴과 잘 맞는 쪽을 골라주세요.', optionSet: 'patternTexture'},
  {id: 'detailPatternDistance', eyebrow: '스타일링 세부', title: '패턴이 얼굴 가까이에 있을 때 반응은?', helper: '목도리, 셔츠, 상의 패턴이 얼굴을 살리는지 확인해보세요.', optionSet: 'patternTexture'},
  {id: 'detailAccessoryEarring', eyebrow: '스타일링 세부', title: '귀걸이 형태는 어떤 쪽이 좋나요?', helper: '작은 포인트, 심플 금속, 클래식 진주, 큰 직선 포인트를 비교해보세요.', optionSet: 'accessoryShape'},
  {id: 'detailAccessoryGlasses', eyebrow: '스타일링 세부', title: '안경테나 선글라스 프레임은?', helper: '둥근 프레임, 얇은 프레임, 클래식 프레임, 각진 프레임 중 골라주세요.', optionSet: 'accessoryShape'},
  {id: 'detailDailyMood', eyebrow: '이미지 세부', title: '데일리룩에서 가장 듣고 싶은 인상은?', helper: '친근함, 편안함, 신뢰감, 존재감 중 우선순위를 골라주세요.', optionSet: 'imageMood'},
  {id: 'detailWorkMood', eyebrow: '이미지 세부', title: '업무나 면접 상황에서 원하는 이미지는?', helper: '상황별로 보여주고 싶은 분위기를 기준으로 골라주세요.', optionSet: 'imageMood'},
  {id: 'detailDateMood', eyebrow: '이미지 세부', title: '약속이나 데이트에서 원하는 이미지는?', helper: '사진에 남았을 때 편안한 무드를 떠올려주세요.', optionSet: 'imageMood'},
  {id: 'detailPhotoMood', eyebrow: '이미지 세부', title: '사진 촬영에서 가장 잘 사는 분위기는?', helper: '밝은 표정, 자연스러운 여백, 정돈감, 강한 포인트 중 골라주세요.', optionSet: 'imageMood'},
] as const;

const repeatedDetailedQuestionSeeds = detailedQuestionSeeds.flatMap((seed, index) =>
  [0, 1, 2].map(round => ({
    ...seed,
    id: `${seed.id}R${round + 1}`,
    title:
      round === 0
        ? seed.title
        : round === 1
        ? `${seed.title} 평소 선택`
        : `${seed.title} 사진 확인`,
    helper:
      round === 0
        ? seed.helper
        : round === 1
        ? `${seed.helper} 평소 가장 자주 선택하는 스타일을 기준으로 답해주세요.`
        : `${seed.helper} 최근 사진에서 얼굴과 스타일이 함께 좋아 보인 경우를 기준으로 답해주세요.`,
    unknownGuide: round === 0 ? seed.unknownGuide : undefined,
    eyebrow:
      round === 0
        ? seed.eyebrow
        : `${seed.eyebrow} ${round === 1 ? '평소 선택' : '사진 확인'}`,
  })),
);

const detailedLocalBeautySurveyQuestions = repeatedDetailedQuestionSeeds.map(
  seed => createDetailedQuestion(seed),
);

export const localBeautySurveyQuestions = [
  ...baseLocalBeautySurveyQuestions,
  ...detailedLocalBeautySurveyQuestions,
].map(addUnknownOption) satisfies readonly LocalBeautySurveyQuestion[];

export function normalizeLocalBeautySurveyAnswerOptionIds(
  value: LocalBeautySurveyAnswerInput,
  validOptionIds?: readonly LocalBeautySurveyOptionId[],
): LocalBeautySurveyAnswer {
  const rawOptionIds = Array.isArray(value)
    ? value
    : typeof value === 'string'
    ? [value]
    : [];
  const uniqueOptionIds = rawOptionIds.filter(
    (optionId, index) =>
      typeof optionId === 'string' &&
      optionId.length > 0 &&
      rawOptionIds.indexOf(optionId) === index &&
      (!validOptionIds || validOptionIds.includes(optionId)),
  );
  const knownOptionIds = uniqueOptionIds.filter(
    optionId => optionId !== LOCAL_BEAUTY_UNKNOWN_OPTION_ID,
  );

  if (knownOptionIds.length > 0) {
    return knownOptionIds.slice(0, LOCAL_BEAUTY_MAX_SELECTED_OPTIONS);
  }

  if (uniqueOptionIds.includes(LOCAL_BEAUTY_UNKNOWN_OPTION_ID)) {
    return [LOCAL_BEAUTY_UNKNOWN_OPTION_ID];
  }

  return [];
}

function createDetailedQuestion(seed: DetailedQuestionSeed): LocalBeautySurveyQuestion {
  return {
    eyebrow: seed.eyebrow,
    helper: seed.helper,
    id: seed.id,
    options: detailedQuestionOptionSets[seed.optionSet].map(option => ({
      ...option,
      id: `${seed.id}-${option.id}`,
    })),
    title: seed.title,
    unknownGuide: seed.unknownGuide ?? getUnknownGuide(seed),
  };
}

function addUnknownOption(
  question: Omit<LocalBeautySurveyQuestion, 'unknownGuide'> &
    Partial<Pick<LocalBeautySurveyQuestion, 'unknownGuide'>>,
): LocalBeautySurveyQuestion {
  return {
    eyebrow: question.eyebrow,
    helper: question.helper,
    id: question.id,
    options: [
      ...question.options,
      {
        id: LOCAL_BEAUTY_UNKNOWN_OPTION_ID,
        label: '모르겠음',
        description: LOCAL_BEAUTY_UNKNOWN_OPTION_DESCRIPTION,
      },
    ],
    title: question.title,
    unknownGuide: question.unknownGuide ?? getUnknownGuide(question),
  };
}

function getUnknownGuide(
  question: Pick<LocalBeautySurveyQuestion, 'eyebrow' | 'helper' | 'id' | 'title'>,
) {
  const questionText = `${question.id} ${question.eyebrow} ${question.title}`;
  const helperText = question.helper.replace(/[.。]$/, '');

  if (/faceShape|얼굴형|턱선|광대|이마|얼굴 길이|얼굴 폭|옆모습|목선/.test(questionText)) {
    return `확인법: 최근 정면, 옆모습, 살짝 측면 사진을 각각 1장씩 보고 얼굴 하단, 광대, 이마, 목선 중 이 질문과 가까운 요소만 비교해보세요. ${helperText}. 특정 얼굴형 이름을 맞히기보다 어떤 연출에서 얼굴이 편안해 보이는지만 고르면 됩니다.`;
  }

  if (/hair|헤어|앞머리|가르마|모발/.test(questionText)) {
    return `확인법: 최근 정면 사진과 옆모습 사진을 각각 2장씩 보고, 얼굴 옆선이 답답하지 않고 표정이 또렷해 보이는 헤어 길이와 볼륨을 비교해보세요. ${helperText}. 두 후보가 비슷하면 현재 가장 자주 하는 머리를 기준으로 골라주세요.`;
  }

  if (/fashion|body|상의|하의|허리|패션|체형|핏|실루엣|레이어링|소재|패턴|액세서리|어깨|골반|다리|상체|하체/.test(questionText)) {
    return `확인법: 전신 거울 사진이나 최근 외출 사진 3장을 보고, 얼굴보다 옷의 부피나 패턴이 먼저 튀지 않는 조합을 찾아보세요. ${helperText}. 상의 길이, 허리선, 어깨선, 소재 두께 중 이 질문과 가장 가까운 요소 하나만 비교하면 쉬워요.`;
  }

  if (/makeup|lip|base|메이크업|립|치크|베이스|눈썹|음영/.test(questionText)) {
    return `확인법: 같은 조명에서 메이크업 요소를 하나만 바꾼 사진을 비교해보세요. ${helperText}. 피부가 덜 피곤해 보이고 색보다 얼굴 인상이 먼저 보이는 쪽을 고르면 됩니다.`;
  }

  if (/color|tone|skin|jewelry|컬러|톤|피부|금속|혈관|햇빛/.test(questionText)) {
    return `확인법: 낮 시간 창가 자연광에서 관련 색을 얼굴 가까이에 대고 사진을 찍어보세요. ${helperText}. 피부가 노랗거나 붉게 뜨지 않고 눈동자와 입술 경계가 편안해 보이는 쪽을 기준으로 고르면 좋아요.`;
  }

  if (/image|impression|mood|이미지|인상|무드|상황/.test(questionText)) {
    return `확인법: 최근 마음에 들었던 사진 3장을 골라 공통점을 찾으면 답하기 쉬워요. ${helperText}. 밝고 친근한지, 부드럽고 자연스러운지, 단정하고 신뢰감 있는지, 선명하고 도시적인지 중 가장 자주 반복되는 인상을 선택하면 됩니다.`;
  }

  return `확인법: ${helperText}. 최근 사진과 평소 자주 선택한 스타일을 함께 보고, 얼굴이 편안하고 표정이 살아 보이는 쪽을 골라주세요.`;
}

const optionScores: Partial<Record<LocalBeautySurveyOptionId, OptionScore>> = {
  airyFresh: {
    depth: {bright: 1, light: 1},
    faceImage: {clean: 2, lovely: 1},
    season: {springWarm: 1},
  },
  airyBangs: {
    faceImage: {clean: 1, lovely: 1},
    hair: {softLayeredBob: 1},
    style: {lightRomantic: 1},
  },
  aLineBottom: {
    faceImage: {lovely: 1},
    style: {lightRomantic: 2},
  },
  balancedClean: {
    depth: {light: 1, soft: 1},
    faceImage: {clean: 2, soft: 1},
    season: {neutral: 1},
  },
  berryRed: {depth: {deep: 2, clear: 1}, faceImage: {chic: 1}, season: {winterCool: 2}},
  both: {depth: {soft: 1}, faceImage: {natural: 1}, season: {neutral: 2}},
  boldMinimal: {
    depth: {clear: 1, deep: 1},
    faceImage: {chic: 2, modern: 2},
    season: {winterCool: 1},
  },
  boldGraphicPattern: {
    faceImage: {chic: 1, modern: 1},
    style: {urbanStatementFit: 2},
  },
  boldPresenceKeyword: {
    faceImage: {chic: 2, modern: 1},
    style: {urbanStatementFit: 2},
  },
  brightPeach: {
    depth: {light: 2, bright: 1},
    faceImage: {clean: 1, lovely: 1},
    season: {springWarm: 2},
  },
  calmBeige: {
    depth: {mute: 2, soft: 1},
    faceImage: {classic: 1, natural: 1},
    season: {autumnWarm: 2},
  },
  calmStraight: {
    depth: {mute: 1, soft: 1},
    faceImage: {classic: 2, natural: 1},
    season: {autumnWarm: 1},
  },
  chicModern: {
    depth: {clear: 1, deep: 1},
    faceImage: {chic: 3, modern: 2},
    season: {winterCool: 1},
  },
  classicNatural: {
    depth: {mute: 1, soft: 1},
    faceImage: {classic: 3, natural: 2},
    season: {autumnWarm: 1},
  },
  cleanLovely: {
    depth: {light: 1},
    faceImage: {clean: 3, lovely: 2},
    season: {springWarm: 1},
  },
  clearContrast: {
    depth: {clear: 2, deep: 1},
    faceImage: {chic: 1, modern: 1},
    season: {winterCool: 2},
  },
  clearWarm: {
    depth: {bright: 1, light: 2},
    faceImage: {clean: 1},
    season: {springWarm: 2},
  },
  coralPeach: {
    depth: {bright: 1, light: 2},
    faceImage: {lovely: 1},
    season: {springWarm: 2},
  },
  definedSharp: {
    depth: {clear: 1, deep: 1},
    faceImage: {chic: 2, modern: 1},
    season: {winterCool: 1},
  },
  gold: {depth: {soft: 1}, faceImage: {classic: 1}, season: {autumnWarm: 1, springWarm: 1}},
  glossyLight: {
    depth: {light: 1},
    faceImage: {clean: 2, lovely: 1},
    season: {springWarm: 1},
  },
  cCurveVolume: {
    depth: {mute: 1, soft: 1},
    faceImage: {classic: 2, soft: 1},
    hair: {classicCcurveMedium: 3},
    season: {autumnWarm: 1},
  },
  calmGentleKeyword: {
    faceImage: {natural: 1, soft: 1},
    style: {softCasual: 2},
  },
  classicIlineSilhouette: {
    faceImage: {classic: 1},
    style: {classicTailoredFit: 3},
  },
  contrastLayering: {
    faceImage: {chic: 1, modern: 1},
    style: {urbanStatementFit: 2},
  },
  croppedJacketTop: {
    faceImage: {clean: 1, modern: 1},
    style: {cleanMinimal: 2},
  },
  crownSoftVolume: {
    faceImage: {natural: 1, soft: 1},
    hair: {naturalLayeredMedium: 1},
    style: {softCasual: 1},
  },
  curtainBangs: {
    faceImage: {natural: 1, soft: 1},
    hair: {naturalLayeredMedium: 1},
    style: {softCasual: 1},
  },
  dailyCasualOccasion: {
    faceImage: {natural: 1},
    style: {softCasual: 2},
  },
  dateSoftOccasion: {
    faceImage: {lovely: 1, soft: 1},
    style: {lightRomantic: 2},
  },
  elegantQuietMood: {
    faceImage: {classic: 1},
    season: {autumnWarm: 1},
    style: {classicTailoredFit: 2},
  },
  eveningPointOccasion: {
    faceImage: {chic: 1, modern: 1},
    style: {urbanStatementFit: 2},
  },
  fittedRibTop: {
    faceImage: {lovely: 1},
    style: {lightRomantic: 2},
  },
  flatSleekLine: {
    faceImage: {chic: 1, modern: 1},
    hair: {sleekStraightLong: 1},
    style: {urbanStatementFit: 1},
  },
  freshFriendlyKeyword: {
    faceImage: {clean: 1, lovely: 1},
    style: {lightRomantic: 2, cleanMinimal: 1},
  },
  highClear: {
    depth: {clear: 1, deep: 2},
    faceImage: {chic: 1, modern: 1},
    season: {winterCool: 2},
  },
  highWaistLine: {
    faceImage: {clean: 1, lovely: 1},
    style: {lightRomantic: 2},
  },
  lowSoft: {
    depth: {mute: 2, soft: 1},
    faceImage: {classic: 1, natural: 1},
    season: {autumnWarm: 2},
  },
  longColumnBottom: {
    faceImage: {classic: 1, chic: 1},
    style: {classicTailoredFit: 1, urbanStatementFit: 2},
  },
  lowCalmVolume: {
    faceImage: {classic: 1, soft: 1},
    hair: {classicCcurveMedium: 1},
    style: {classicTailoredFit: 1},
  },
  lowRiseRelaxedLine: {
    faceImage: {natural: 1},
    style: {softCasual: 2},
  },
  mediumNatural: {
    depth: {soft: 2},
    faceImage: {natural: 2},
    season: {neutral: 1},
  },
  mutedEarth: {
    depth: {mute: 2, soft: 1},
    faceImage: {classic: 1, natural: 1},
    season: {autumnWarm: 2},
  },
  minimalCleanMood: {
    faceImage: {clean: 1, modern: 1},
    season: {neutral: 1},
    style: {cleanMinimal: 2, softCasual: 1},
  },
  modernSharpSilhouette: {
    faceImage: {chic: 1, modern: 1},
    style: {urbanStatementFit: 3},
  },
  lightWave: {
    depth: {light: 1, soft: 1},
    faceImage: {lovely: 2, soft: 1},
    hair: {softLayeredBob: 3, naturalLayeredMedium: 1},
    season: {springWarm: 1},
  },
  lightLayering: {
    faceImage: {clean: 1, lovely: 1},
    style: {lightRomantic: 2},
  },
  mediumLayer: {
    depth: {soft: 1},
    faceImage: {classic: 1, natural: 2},
    hair: {classicCcurveMedium: 1, naturalLayeredMedium: 3},
    season: {neutral: 1},
  },
  naturalLooseSilhouette: {
    faceImage: {natural: 1, soft: 1},
    style: {softCasual: 3},
  },
  noBangsSleek: {
    faceImage: {chic: 1, modern: 1},
    hair: {sleekStraightLong: 1},
    style: {urbanStatementFit: 1},
  },
  officeCleanOccasion: {
    faceImage: {classic: 1, clean: 1},
    style: {classicTailoredFit: 2, cleanMinimal: 1},
  },
  oneToneSetLayer: {
    faceImage: {clean: 1, natural: 1},
    style: {cleanMinimal: 2, softCasual: 1},
  },
  pinkCool: {
    depth: {light: 1, mute: 1},
    faceImage: {soft: 1},
    season: {summerCool: 2},
  },
  plainTexturePattern: {
    faceImage: {clean: 1, natural: 1},
    style: {cleanMinimal: 2, softCasual: 1},
  },
  powderCool: {
    depth: {light: 1, mute: 1},
    faceImage: {soft: 1},
    season: {summerCool: 2},
  },
  refinedTrustKeyword: {
    faceImage: {classic: 2},
    style: {classicTailoredFit: 2},
  },
  refinedClassic: {
    depth: {mute: 1, soft: 1},
    faceImage: {classic: 2, natural: 1},
    season: {autumnWarm: 1},
  },
  relaxedNatural: {
    depth: {soft: 2},
    faceImage: {natural: 2, soft: 1},
    season: {neutral: 1},
  },
  relaxedShirtTop: {
    faceImage: {natural: 1},
    style: {softCasual: 2},
  },
  romanticFreshMood: {
    faceImage: {clean: 1, lovely: 1},
    season: {springWarm: 1},
    style: {lightRomantic: 2},
  },
  shoulderStructuredBalance: {
    faceImage: {chic: 1, modern: 1},
    style: {urbanStatementFit: 2},
  },
  sideLightVolume: {
    faceImage: {clean: 1, lovely: 1},
    hair: {softLayeredBob: 1},
    style: {lightRomantic: 1},
  },
  sidePartVolume: {
    faceImage: {classic: 1},
    hair: {classicCcurveMedium: 1},
    style: {classicTailoredFit: 1},
  },
  smallPrintPattern: {
    faceImage: {lovely: 1},
    style: {lightRomantic: 2},
  },
  softCompactSilhouette: {
    faceImage: {clean: 1, lovely: 1},
    style: {lightRomantic: 2, cleanMinimal: 1},
  },
  naturalAir: {
    depth: {soft: 2},
    faceImage: {natural: 2, soft: 1},
    hair: {naturalLayeredMedium: 3},
    season: {neutral: 1},
  },
  roundedSoft: {
    depth: {light: 1, soft: 1},
    faceImage: {lovely: 2, soft: 1},
    season: {springWarm: 1},
  },
  roseBrown: {
    depth: {mute: 2},
    faceImage: {classic: 1, natural: 1},
    season: {autumnWarm: 2},
  },
  rosePink: {
    depth: {light: 1, mute: 1},
    faceImage: {soft: 1, lovely: 1},
    season: {summerCool: 2},
  },
  silver: {depth: {clear: 1}, faceImage: {modern: 1}, season: {summerCool: 1, winterCool: 1}},
  shortPoint: {
    depth: {clear: 1},
    faceImage: {chic: 1, modern: 2},
    hair: {shortTexturedPoint: 3},
    season: {winterCool: 1},
  },
  sharpPoint: {
    depth: {clear: 1, deep: 1},
    faceImage: {chic: 2, modern: 1},
    season: {winterCool: 1},
  },
  straightDenimBottom: {
    faceImage: {clean: 1, natural: 1},
    style: {cleanMinimal: 2},
  },
  straightRelaxedBalance: {
    faceImage: {natural: 1},
    style: {softCasual: 2},
  },
  stripeCheckPattern: {
    faceImage: {classic: 1},
    style: {classicTailoredFit: 2},
  },
  structuredBlazerTop: {
    faceImage: {classic: 1, chic: 1},
    style: {classicTailoredFit: 2, urbanStatementFit: 1},
  },
  tailoredLayering: {
    faceImage: {classic: 1},
    style: {classicTailoredFit: 2},
  },
  tuckedCleanLine: {
    faceImage: {classic: 1, modern: 1},
    style: {classicTailoredFit: 1, urbanStatementFit: 1},
  },
  untuckedLayerLine: {
    faceImage: {natural: 1, soft: 1},
    style: {softCasual: 2},
  },
  upperLightBalance: {
    faceImage: {clean: 1},
    style: {cleanMinimal: 2},
  },
  urbanStatementMood: {
    faceImage: {chic: 1, modern: 1},
    season: {winterCool: 1},
    style: {urbanStatementFit: 2},
  },
  waistDefinedBalance: {
    faceImage: {classic: 1, lovely: 1},
    style: {lightRomantic: 1, classicTailoredFit: 1},
  },
  wideSlacksBottom: {
    faceImage: {natural: 1, soft: 1},
    style: {softCasual: 2},
  },
  ashBrown: {
    depth: {mute: 1, soft: 1},
    faceImage: {classic: 1, soft: 1},
    season: {autumnWarm: 1, summerCool: 1},
  },
  blurTint: {
    depth: {mute: 1, soft: 1},
    faceImage: {natural: 1, soft: 2},
    season: {neutral: 1, summerCool: 1},
  },
  boldSharp: {
    depth: {clear: 1, deep: 1},
    faceImage: {chic: 2, modern: 2},
    season: {winterCool: 2},
  },
  classicTailored: {
    depth: {mute: 1},
    faceImage: {classic: 3},
    season: {autumnWarm: 2},
  },
  cleanArch: {
    depth: {light: 1, soft: 1},
    faceImage: {classic: 1, clean: 1},
    season: {neutral: 1, summerCool: 1},
  },
  clearBrown: {
    depth: {bright: 1, light: 2},
    faceImage: {clean: 1, lovely: 1},
    season: {springWarm: 2},
  },
  clearFull: {
    depth: {clear: 1, deep: 1},
    faceImage: {chic: 2, modern: 1},
    season: {winterCool: 2},
  },
  coolClean: {
    depth: {light: 1, mute: 1},
    faceImage: {clean: 2, soft: 1},
    season: {summerCool: 2},
  },
  coolVein: {
    depth: {clear: 1},
    faceImage: {modern: 1},
    season: {summerCool: 1, winterCool: 2},
  },
  crispLeather: {
    depth: {clear: 1, deep: 1},
    faceImage: {chic: 2, modern: 2},
    season: {winterCool: 2},
  },
  deepBlack: {
    depth: {clear: 1, deep: 2},
    faceImage: {chic: 2, modern: 1},
    season: {winterCool: 2},
  },
  deepContrast: {
    depth: {clear: 1, deep: 2},
    faceImage: {chic: 2},
    season: {winterCool: 2},
  },
  deepRich: {
    depth: {clear: 1, deep: 2},
    faceImage: {chic: 2},
    season: {winterCool: 2},
  },
  delicateDetail: {
    depth: {light: 1},
    faceImage: {clean: 1, lovely: 2},
    season: {springWarm: 2},
  },
  earthyElegant: {
    depth: {mute: 2, soft: 1},
    faceImage: {classic: 2, natural: 1},
    season: {autumnWarm: 3},
  },
  glossTint: {
    depth: {bright: 1, light: 2},
    faceImage: {clean: 1, lovely: 1},
    season: {springWarm: 2},
  },
  goldenTan: {
    depth: {bright: 1, light: 1},
    faceImage: {clean: 1},
    season: {autumnWarm: 1, springWarm: 2},
  },
  lightClear: {
    depth: {bright: 1, light: 2},
    faceImage: {clean: 2},
    season: {springWarm: 1, summerCool: 1},
  },
  mediumClean: {
    depth: {soft: 1},
    faceImage: {clean: 1, natural: 1},
    season: {neutral: 1},
  },
  minimalStatement: {
    depth: {clear: 1, deep: 1},
    faceImage: {chic: 1, modern: 2},
    season: {winterCool: 2},
  },
  mutedGray: {
    depth: {mute: 2, soft: 1},
    faceImage: {classic: 1, soft: 1},
    season: {autumnWarm: 1, summerCool: 1},
  },
  mutedSoft: {
    depth: {mute: 2, soft: 1},
    faceImage: {classic: 1, soft: 2},
    season: {autumnWarm: 1, summerCool: 1},
  },
  naturalTexture: {
    depth: {soft: 2},
    faceImage: {natural: 2, soft: 1},
    season: {neutral: 2},
  },
  neutralBalanced: {
    depth: {soft: 1},
    faceImage: {natural: 1},
    season: {neutral: 2},
  },
  neutralVein: {
    depth: {soft: 1},
    faceImage: {natural: 1},
    season: {neutral: 2},
  },
  oliveTan: {
    depth: {mute: 2, soft: 1},
    faceImage: {classic: 1, natural: 1},
    season: {autumnWarm: 2},
  },
  redEasily: {
    depth: {clear: 1, light: 1},
    faceImage: {soft: 1},
    season: {summerCool: 2, winterCool: 1},
  },
  refinedSimple: {
    depth: {mute: 1, soft: 1},
    faceImage: {classic: 2},
    season: {autumnWarm: 2},
  },
  satinNatural: {
    depth: {mute: 1, soft: 1},
    faceImage: {classic: 1, natural: 1},
    season: {autumnWarm: 1, neutral: 1},
  },
  sharpDefined: {
    depth: {clear: 1, deep: 1},
    faceImage: {chic: 3},
    season: {winterCool: 2},
  },
  sheerGlossy: {
    depth: {bright: 1, light: 1},
    faceImage: {clean: 2, lovely: 1},
    season: {springWarm: 2},
  },
  sleekLong: {
    depth: {clear: 1, deep: 1},
    faceImage: {chic: 1, modern: 2},
    hair: {sleekStraightLong: 3},
    season: {winterCool: 1},
  },
  smallSoft: {
    depth: {light: 1, soft: 1},
    faceImage: {lovely: 2, soft: 1},
    season: {springWarm: 1},
  },
  softArch: {
    depth: {light: 1, soft: 1},
    faceImage: {lovely: 2, soft: 1},
    season: {springWarm: 1},
  },
  softBlack: {
    depth: {deep: 1, soft: 1},
    faceImage: {modern: 1, natural: 1},
    season: {neutral: 1, winterCool: 1},
  },
  softBob: {
    depth: {light: 1, soft: 1},
    faceImage: {clean: 1, lovely: 2},
    hair: {softLayeredBob: 3},
    season: {springWarm: 1},
  },
  softBlur: {
    depth: {mute: 1, soft: 1},
    faceImage: {soft: 2, natural: 1},
    season: {summerCool: 1},
  },
  softBrown: {
    depth: {soft: 2},
    faceImage: {natural: 2},
    season: {autumnWarm: 1, neutral: 1},
  },
  softCotton: {
    depth: {soft: 2},
    faceImage: {natural: 1, soft: 1},
    season: {neutral: 1, summerCool: 1},
  },
  softLight: {
    depth: {light: 2, soft: 1},
    faceImage: {clean: 1, soft: 1},
    season: {springWarm: 1, summerCool: 1},
  },
  softNatural: {
    depth: {soft: 2},
    faceImage: {natural: 3, soft: 2},
    season: {neutral: 1},
  },
  structuredMatte: {
    depth: {mute: 1},
    faceImage: {classic: 2},
    season: {autumnWarm: 1},
  },
  staysEven: {
    depth: {soft: 1},
    faceImage: {natural: 1},
    season: {neutral: 2},
  },
  statementChic: {
    depth: {clear: 1, deep: 2},
    faceImage: {chic: 3, modern: 2},
    season: {winterCool: 3},
  },
  straightNatural: {
    depth: {soft: 2},
    faceImage: {classic: 1, natural: 2},
    season: {autumnWarm: 1, neutral: 1},
  },
  straightGloss: {
    depth: {clear: 1, deep: 1},
    faceImage: {chic: 2, modern: 2},
    hair: {sleekStraightLong: 3},
    season: {winterCool: 1},
  },
  suedeMatte: {
    depth: {mute: 2},
    faceImage: {classic: 2, natural: 1},
    season: {autumnWarm: 2},
  },
  unclearVein: {
    depth: {soft: 1},
    faceImage: {natural: 1},
    season: {neutral: 1},
  },
  vividMono: {
    depth: {clear: 1, deep: 2},
    faceImage: {chic: 1, modern: 1},
    season: {winterCool: 2},
  },
  warmBrown: {
    depth: {light: 1, soft: 1},
    faceImage: {classic: 1, lovely: 1},
    season: {autumnWarm: 1, springWarm: 1},
  },
  warmFresh: {
    depth: {bright: 1, light: 2},
    faceImage: {clean: 2, lovely: 2},
    season: {springWarm: 3},
  },
  warmVein: {
    depth: {soft: 1},
    faceImage: {natural: 1},
    season: {autumnWarm: 1, springWarm: 2},
  },
};

const seasonPresentation = {
  autumnWarm: {
    labelPrefix: '가을웜',
    palette: ['#C27A4B', '#8A5A44', '#A88A60', '#6F6A4B'],
    summary: '따뜻하고 차분한 색을 낮은 채도로 얹을 때 분위기가 안정적으로 살아나요.',
  },
  neutral: {
    labelPrefix: '뉴트럴',
    palette: ['#D7C7B8', '#9B8C83', '#C5A6A1', '#6F7472'],
    summary: '웜/쿨보다 밝기와 채도 균형이 중요해요. 너무 강한 색보다 부드러운 색이 안정적이에요.',
  },
  springWarm: {
    labelPrefix: '봄웜',
    palette: ['#F6C9A8', '#F28F7A', '#F5D66B', '#FFF0D9'],
    summary: '밝고 맑은 피치, 코랄, 아이보리 계열이 얼굴의 생기를 가장 자연스럽게 살려요.',
  },
  summerCool: {
    labelPrefix: '여름쿨',
    palette: ['#D8C8E8', '#DFA9BA', '#B9C9E6', '#F4EAF1'],
    summary: '차갑고 은은한 로즈, 라벤더, 소프트 블루 계열이 피부를 맑고 정돈되어 보이게 해요.',
  },
  winterCool: {
    labelPrefix: '겨울쿨',
    palette: ['#7B2F57', '#111111', '#F5F5F5', '#B1123A'],
    summary: '선명한 대비와 좁은 포인트 컬러가 인상을 또렷하고 세련되게 만들어줘요.',
  },
} as const satisfies Record<
  PersonalColorSeason,
  {labelPrefix: string; palette: readonly string[]; summary: string}
>;

const depthLabel = {
  bright: '브라이트',
  clear: '클리어',
  deep: '딥',
  light: '라이트',
  mute: '뮤트',
  soft: '소프트',
} as const satisfies Record<PersonalColorDepth, string>;

const faceImageShortLabel = {
  chic: '시크',
  classic: '클래식',
  clean: '맑음',
  lovely: '러블리',
  modern: '모던',
  natural: '내추럴',
  soft: '소프트',
} as const satisfies Record<FaceImageType, string>;

const faceImagePresentation = {
  chic: {
    label: '시크하고 모던한 이미지',
    keywords: ['선명한 라인', '절제된 포인트', '쿨한 무드'],
    summary: '깔끔한 여백과 또렷한 포인트를 줄 때 인상이 가장 세련되게 정리돼요.',
  },
  classic: {
    label: '차분하고 클래식한 이미지',
    keywords: ['정돈감', '고급스러움', '낮은 채도'],
    summary: '톤다운 컬러와 부드러운 음영을 쓰면 안정적이고 깊이 있는 분위기가 살아나요.',
  },
  clean: {
    label: '맑고 러블리한 이미지',
    keywords: ['맑은 피부', '가벼운 생기', '투명함'],
    summary: '두꺼운 표현보다 얇은 윤광과 산뜻한 색감이 깨끗한 인상을 살려줘요.',
  },
  lovely: {
    label: '맑고 러블리한 이미지',
    keywords: ['러블리', '생기', '부드러운 곡선'],
    summary: '피치와 코랄처럼 밝은 색을 얇게 올리면 부드러운 매력이 자연스럽게 보여요.',
  },
  modern: {
    label: '시크하고 모던한 이미지',
    keywords: ['간결함', '대비감', '미니멀'],
    summary: '색을 많이 쓰기보다 하나의 선명한 포인트를 남길 때 얼굴 인상이 정돈돼요.',
  },
  natural: {
    label: '부드럽고 내추럴한 이미지',
    keywords: ['편안함', '자연스러움', '소프트'],
    summary: '피부 결을 살리고 컬러 경계를 낮추면 편안하고 자연스러운 분위기가 잘 맞아요.',
  },
  soft: {
    label: '부드럽고 내추럴한 이미지',
    keywords: ['은은함', '맑은 음영', '소프트 컬러'],
    summary: '채도를 낮추고 경계를 흐리면 전체 인상이 부드럽고 안정적으로 보여요.',
  },
} as const satisfies Record<
  FaceImageType,
  {keywords: readonly string[]; label: string; summary: string}
>;

const hairPresentation = {
  classicCcurveMedium: {
    label: '클래식 C컬 미디엄',
    summary: '정돈된 C컬과 은은한 볼륨이 차분한 이미지를 고급스럽게 잡아줘요.',
    tips: ['끝선은 안쪽으로 살짝 모아 단정하게 정리해보세요.', '앞머리는 무겁게 내리기보다 사이드 결을 살리면 좋아요.'],
  },
  naturalLayeredMedium: {
    label: '내추럴 미디엄 레이어',
    summary: '자연스러운 층과 공기감이 편안한 분위기를 부드럽게 살려줘요.',
    tips: ['얼굴 옆머리는 과하게 고정하지 말고 결을 남겨보세요.', '컬은 굵고 느슨하게 넣어 부담을 낮추면 안정적이에요.'],
  },
  shortTexturedPoint: {
    label: '텍스처 포인트 쇼트',
    summary: '짧은 길이에 가벼운 질감을 더하면 선명하고 모던한 인상이 살아나요.',
    tips: ['윗부분 볼륨은 작게 세우고 옆선은 깔끔하게 눌러보세요.', '컬러는 너무 밝게 빼기보다 대비를 남기는 편이 좋아요.'],
  },
  sleekStraightLong: {
    label: '슬릭 스트레이트 롱',
    summary: '선명한 라인과 차분한 윤기를 살린 헤어가 인상을 또렷하게 정리해요.',
    tips: ['앞머리는 가볍게 비우고 얼굴 옆 라인을 정돈해보세요.', '무거운 컬보다 매끈한 결 표현이 더 안정적이에요.'],
  },
  softLayeredBob: {
    label: '소프트 레이어드 보브',
    summary: '가벼운 단발 실루엣과 부드러운 웨이브가 맑고 산뜻한 인상을 살려줘요.',
    tips: ['턱선 아래에 무게를 많이 두기보다 끝선을 가볍게 정리해보세요.', '잔잔한 웨이브와 자연스러운 볼륨이 잘 맞아요.'],
  },
} as const satisfies Record<
  HairRecommendationType,
  {label: string; summary: string; tips: readonly string[]}
>;

const stylePresentation = {
  classicTailoredFit: {
    fit: '허리선과 어깨선을 단정하게 잡는 테일러드 핏',
    label: '클래식 테일러드 핏',
    silhouette: 'I라인과 정돈된 재킷, 슬랙스 중심',
    summary: '차분한 선과 단정한 구조감이 클래식한 이미지를 고급스럽게 정리해요.',
    tips: ['재킷, 셔츠, 슬랙스처럼 선이 분명한 아이템이 좋아요.', '패턴은 스트라이프나 체크처럼 질서 있는 방향이 안정적이에요.'],
  },
  cleanMinimal: {
    fit: '몸선을 과하게 드러내지 않는 정돈된 기본핏',
    label: '클린 미니멀 실루엣',
    silhouette: '원톤 세트와 담백한 직선 실루엣',
    summary: '컬러 수를 줄이고 깨끗한 선을 남기면 이미지가 맑고 단정하게 보여요.',
    tips: ['상하의 톤을 맞추고 소재 차이로만 깊이를 만들어보세요.', '장식보다 핏과 길이 균형을 먼저 맞추면 좋아요.'],
  },
  lightRomantic: {
    fit: '허리선은 가볍게 잡고 부드러운 곡선을 살리는 핏',
    label: '라이트 로맨틱 무드',
    silhouette: '짧은 상의, A라인, 작은 디테일처럼 산뜻한 균형',
    summary: '가벼운 실루엣과 작은 포인트가 맑고 생기 있는 이미지를 살려줘요.',
    tips: ['작은 패턴이나 밝은 상의를 얼굴 가까이에 두면 좋아요.', '하의는 A라인이나 세미 와이드처럼 움직임을 남겨보세요.'],
  },
  softCasual: {
    fit: '너무 붙지 않는 편안한 여유핏',
    label: '소프트 캐주얼 핏',
    silhouette: '부드러운 레이어와 자연스러운 소재 중심',
    summary: '편안한 소재와 과하지 않은 여유가 내추럴한 이미지를 안정적으로 보여줘요.',
    tips: ['셔츠나 니트는 몸에서 살짝 떨어지는 핏을 골라보세요.', '톤 차이가 크지 않은 레이어링이 얼굴 분위기와 잘 맞아요.'],
  },
  urbanStatementFit: {
    fit: '어깨선과 세로선을 선명하게 잡는 구조적인 핏',
    label: '어반 포인트 실루엣',
    silhouette: '긴 직선감과 강한 포인트를 하나만 남기는 스타일',
    summary: '선명한 라인과 절제된 컬러 대비가 시크한 이미지를 또렷하게 살려줘요.',
    tips: ['재킷, 롱 스커트, 스트레이트 팬츠처럼 세로선을 남겨보세요.', '포인트는 한 곳만 크게 두고 나머지는 미니멀하게 정리해보세요.'],
  },
} as const satisfies Record<
  StyleRecommendationType,
  {fit: string; label: string; silhouette: string; summary: string; tips: readonly string[]}
>;

const hairColorByTone = {
  ashBrown: '애쉬 브라운이나 소프트 다크 브라운',
  deepBlack: '딥 블랙이나 쿨 다크 브라운',
  softBlack: '소프트 블랙이나 뉴트럴 브라운',
  warmBrown: '라이트 브라운이나 피치 브라운',
} as const satisfies Record<
  HairToneOptionId,
  string
>;

const hairFallbackByFaceImage = {
  chic: 'sleekStraightLong',
  classic: 'classicCcurveMedium',
  clean: 'softLayeredBob',
  lovely: 'softLayeredBob',
  modern: 'sleekStraightLong',
  natural: 'naturalLayeredMedium',
  soft: 'naturalLayeredMedium',
} as const satisfies Record<FaceImageType, HairRecommendationType>;

const styleFallbackByFaceImage = {
  chic: 'urbanStatementFit',
  classic: 'classicTailoredFit',
  clean: 'cleanMinimal',
  lovely: 'lightRomantic',
  modern: 'urbanStatementFit',
  natural: 'softCasual',
  soft: 'softCasual',
} as const satisfies Record<FaceImageType, StyleRecommendationType>;

const genderPresentationByGender = {
  female: {
    hairSummary:
      '여성 스타일링 기준에서는 얼굴형을 감싸는 옆머리, 앞머리 무게, 윤기 표현을 함께 조절하면 추천 무드가 더 자연스럽게 이어져요.',
    hairTip: '여성 스타일링에서는 앞머리와 옆머리의 양을 먼저 조절한 뒤 컬, 길이, 컬러 변화를 순서대로 시도해보세요.',
    situationSummary:
      '여성 스타일링 맥락에서는 메이크업 포인트와 헤어 볼륨, 상의의 얼굴 가까운 색을 함께 맞추면 완성도가 올라가요.',
    situationTip: '여성 스타일링에서는 립/치크 한 지점과 얼굴 가까운 상의 색을 먼저 맞추고, 헤어 볼륨은 마지막에 조절해보세요.',
    styleSummary:
      '여성 스타일링 기준에서는 허리선, 네크라인, 소재의 움직임을 함께 보면서 너무 꾸민 느낌보다 얼굴이 먼저 보이는 균형을 잡는 편이 좋아요.',
    styleTip: '여성 스타일링에서는 네크라인과 허리선 위치를 먼저 맞춘 뒤 스커트, 팬츠, 원피스의 하단 실루엣을 비교해보세요.',
  },
  male: {
    hairSummary:
      '남성 스타일링 기준에서는 옆선 정리, 앞머리 방향, 모발 윤기와 볼륨의 높이를 조절하면 얼굴형과 이미지 타입이 더 선명하게 보여요.',
    hairTip: '남성 스타일링에서는 옆머리 부피와 앞머리 방향을 먼저 정리하고, 컬러 변화는 자연 모발 대비를 확인한 뒤 시도해보세요.',
    situationSummary:
      '남성 스타일링 맥락에서는 그루밍의 선명도, 셔츠나 재킷의 어깨선, 신발과 액세서리의 무게감을 함께 맞추면 안정적이에요.',
    situationTip: '남성 스타일링에서는 셔츠/니트의 목선과 재킷 어깨선을 먼저 맞추고, 립밤이나 눈썹 정리처럼 작은 그루밍으로 마무리해보세요.',
    styleSummary:
      '남성 스타일링 기준에서는 어깨선, 상의 길이, 팬츠 실루엣이 전체 인상을 크게 바꾸므로 얼굴 가까운 컬러와 구조적인 핏을 함께 보는 편이 좋아요.',
    styleTip: '남성 스타일링에서는 상의 길이와 팬츠 통을 먼저 맞춘 뒤 셔츠, 재킷, 니트의 소재 두께를 바꿔보세요.',
  },
  other: {
    hairSummary:
      '젠더리스 스타일링 기준에서는 남성적/여성적 규칙보다 얼굴선, 대비감, 질감의 강약을 중심으로 헤어를 조절하는 편이 좋아요.',
    hairTip: '젠더리스 스타일링에서는 길이보다 앞머리 방향, 옆선 노출, 모발 질감의 강약을 먼저 비교해보세요.',
    situationSummary:
      '젠더리스 스타일링 맥락에서는 실루엣과 컬러 대비를 중성적으로 정리하고, 메이크업이나 액세서리는 원하는 무드에 맞춰 한 지점만 선택해도 좋아요.',
    situationTip: '젠더리스 스타일링에서는 상의 실루엣과 헤어 질감을 먼저 정하고, 포인트 컬러는 립/액세서리/신발 중 한 곳에만 좁게 써보세요.',
    styleSummary:
      '젠더리스 스타일링 기준에서는 성별화된 아이템보다 직선과 곡선의 비율, 몸에서 떨어지는 여유, 색 대비의 강도를 기준으로 잡으면 안정적이에요.',
    styleTip: '젠더리스 스타일링에서는 오버핏과 테일러드 핏을 모두 입어보고 얼굴이 먼저 보이는 여백과 선을 기준으로 고르면 좋아요.',
  },
  unspecified: {
    hairSummary:
      '성별 기준을 적용하지 않고 얼굴형, 이미지 타입, 모발 질감을 중심으로 헤어 방향을 정리했어요.',
    hairTip: '성별 기준 없이 길이, 볼륨, 질감 중 가장 얼굴이 편안해 보이는 요소 하나부터 바꿔보세요.',
    situationSummary:
      '성별 기준 없이 컬러, 메이크업 강도, 헤어 실루엣, 옷의 선을 함께 보며 상황별로 가장 부담 없는 방향을 잡았어요.',
    situationTip: '성별 기준 없이 얼굴 가까운 색, 헤어 볼륨, 상의 실루엣을 하나씩 바꿔보며 가장 편한 조합을 찾아보세요.',
    styleSummary:
      '성별 기준을 적용하지 않고 체형 밸런스와 이미지 무드를 중심으로 핏과 실루엣을 정리했어요.',
    styleTip: '성별 기준 없이 네크라인, 허리선, 하의 실루엣을 각각 비교해보고 사진에서 균형이 좋은 조합을 남겨보세요.',
  },
} as const satisfies Record<LocalBeautySurveyGender, LocalBeautyGenderPresentation>;

const recommendedMoodBySeason = {
  autumnWarm: '소프트 브라운 무드',
  neutral: '뉴트럴 소프트 글로우',
  springWarm: '맑은 코랄 글로우',
  summerCool: '뮤트 로즈 데일리',
  winterCool: '플럼 모브 포인트',
} as const satisfies Record<PersonalColorSeason, string>;

const avoidedNotesBySeason = {
  autumnWarm: ['형광기 있는 핑크는 얼굴보다 색만 먼저 보일 수 있어요.', '회색기가 강한 베이스는 생기를 낮출 수 있어요.'],
  neutral: ['너무 노란 베이스나 푸른 베이스 한쪽으로 치우치지 않는 편이 좋아요.', '립과 치크 채도 차이가 크면 조화가 깨질 수 있어요.'],
  springWarm: ['탁한 브라운을 넓게 쓰면 맑은 분위기가 줄어들 수 있어요.', '두꺼운 매트 베이스보다 얇은 윤광 표현이 안정적이에요.'],
  summerCool: ['오렌지기가 강한 코랄은 피부를 노랗게 보이게 할 수 있어요.', '선명한 블랙 음영은 부드러운 인상을 무겁게 만들 수 있어요.'],
  winterCool: ['흐린 베이지 톤만 쓰면 인상이 밋밋해질 수 있어요.', '넓은 코랄 블러셔보다 좁은 포인트 컬러가 더 안정적이에요.'],
} as const satisfies Record<PersonalColorSeason, readonly string[]>;

type LocalBeautySituationMood = 'classic' | 'fresh' | 'modern' | 'natural';

const colorAnalysisPresentation = {
  chroma: {
    label: '채도 우선형',
    summary: '색의 따뜻함보다 맑고 선명한지, 부드럽게 낮아졌는지가 인상을 더 크게 바꿔요.',
  },
  neutralBalance: {
    label: '뉴트럴 밸런스형',
    summary: '웜/쿨 한쪽으로 몰기보다 밝기와 채도를 균형 있게 맞출 때 가장 안정적이에요.',
  },
  temperature: {
    label: '색온도 민감형',
    summary: '웜/쿨 방향이 얼굴의 생기와 투명도에 먼저 영향을 주는 편이에요.',
  },
  value: {
    label: '명도 우선형',
    summary: '색의 온도보다 밝고 가벼운지, 깊고 또렷한지가 얼굴 분위기를 더 많이 좌우해요.',
  },
} as const satisfies Record<
  LocalBeautyColorAnalysisAxisId,
  {label: string; summary: string}
>;

const situationQuestionPrefixes = {
  daily: 'detailDailyMood',
  work: 'detailWorkMood',
  date: 'detailDateMood',
  photo: 'detailPhotoMood',
} as const satisfies Record<LocalBeautySituationAnalysisId, string>;

const situationMoodFallbackByFaceImage = {
  chic: 'modern',
  classic: 'classic',
  clean: 'fresh',
  lovely: 'fresh',
  modern: 'modern',
  natural: 'natural',
  soft: 'natural',
} as const satisfies Record<FaceImageType, LocalBeautySituationMood>;

const situationMoodPresentation = {
  daily: {
    classic: {
      summary: '매일 입는 옷에서도 단정한 선과 차분한 컬러를 남기면 안정감이 좋아요.',
      tips: ['기본 니트나 셔츠에 작은 금속 포인트를 더해보세요.', '채도는 낮추고 핏은 깔끔하게 정리하면 좋아요.'],
      title: '깔끔한 베이직 데일리',
    },
    fresh: {
      summary: '밝은 상의와 가벼운 생기 포인트가 친근하고 산뜻한 데일리 무드를 만들어요.',
      tips: ['아이보리, 맑은 핑크, 피치 계열을 얼굴 가까이에 둬보세요.', '립이나 치크는 얇고 투명하게 올리는 편이 좋아요.'],
      title: '맑고 가벼운 데일리',
    },
    modern: {
      summary: '컬러 수를 줄이고 작은 대비를 남기면 편한 옷차림도 또렷하게 보여요.',
      tips: ['블랙, 화이트, 그레이 중 한 축을 기준으로 잡아보세요.', '액세서리는 하나만 선명하게 두면 충분해요.'],
      title: '미니멀 포인트 데일리',
    },
    natural: {
      summary: '소재 결이 보이는 아이템과 낮은 대비가 편안하고 자연스러운 인상을 살려요.',
      tips: ['코튼, 니트, 데님처럼 부드러운 소재를 활용해보세요.', '립 경계는 흐리고 헤어는 자연스러운 결을 남기면 좋아요.'],
      title: '편안한 내추럴 데일리',
    },
  },
  date: {
    classic: {
      summary: '과한 장식보다 은은한 윤기와 정돈된 실루엣이 차분한 매력을 살려요.',
      tips: ['새틴 립이나 로즈 브라운처럼 깊이를 작게 더해보세요.', '스커트나 원피스는 선이 정리된 형태가 좋아요.'],
      title: '차분한 약속 무드',
    },
    fresh: {
      summary: '생기 있는 컬러와 작은 곡선 포인트가 부드럽고 밝은 인상을 만들어줘요.',
      tips: ['치크는 넓게 번지기보다 얇게 생기만 더해보세요.', '작은 귀걸이나 밝은 상의로 시선을 가볍게 올려보세요.'],
      title: '산뜻한 데이트 무드',
    },
    modern: {
      summary: '강한 포인트 하나와 정리된 여백이 세련된 약속 이미지를 만들어요.',
      tips: ['립, 아이라인, 액세서리 중 한 가지만 또렷하게 잡아보세요.', '옷은 간결한 실루엣으로 포인트를 받쳐주는 편이 좋아요.'],
      title: '시크한 약속 포인트',
    },
    natural: {
      summary: '꾸민 느낌을 낮추고 피부결과 헤어결을 살리면 편안한 호감도가 좋아져요.',
      tips: ['베이스는 얇게, 립은 블러 처리로 경계를 낮춰보세요.', '헤어는 느슨한 컬이나 자연스러운 층을 남겨보세요.'],
      title: '부드러운 내추럴 데이트',
    },
  },
  photo: {
    classic: {
      summary: '사진에서는 정돈된 눈썹, 립 경계, 옷의 세로선이 얼굴을 안정적으로 잡아줘요.',
      tips: ['톤다운 컬러를 쓰되 얼굴 중앙은 너무 어둡지 않게 맞춰보세요.', '재킷이나 셔츠처럼 선이 있는 아이템이 잘 받아요.'],
      title: '정돈감 있는 사진 무드',
    },
    fresh: {
      summary: '밝은 베이스와 맑은 포인트가 사진에서 표정과 피부를 환하게 보여줘요.',
      tips: ['광은 얇게 남기고 립/치크 채도는 한 단계만 올려보세요.', '배경이 어두울 때는 밝은 상의가 얼굴을 살려줘요.'],
      title: '맑게 살아나는 사진 무드',
    },
    modern: {
      summary: '렌즈 앞에서는 대비와 라인이 살아날수록 존재감이 또렷해져요.',
      tips: ['립이나 눈매 한 곳에 선명한 포인트를 두면 좋아요.', '전체 룩은 색을 줄이고 실루엣을 길게 남겨보세요.'],
      title: '존재감 있는 촬영 무드',
    },
    natural: {
      summary: '과한 보정보다 부드러운 음영과 자연스러운 소재가 사진 속 분위기를 편하게 만들어요.',
      tips: ['그림자가 강한 조명에서는 음영을 넓게 쌓지 않는 편이 좋아요.', '헤어와 옷의 질감은 자연스럽게 남겨보세요.'],
      title: '자연스러운 사진 무드',
    },
  },
  work: {
    classic: {
      summary: '업무나 면접에서는 신뢰감 있는 선과 낮은 채도의 정돈감이 가장 안정적이에요.',
      tips: ['셔츠, 블레이저, 슬랙스처럼 구조가 있는 아이템을 써보세요.', '메이크업은 립과 눈썹 경계를 단정하게 맞추면 좋아요.'],
      title: '단정한 출근/면접 무드',
    },
    fresh: {
      summary: '밝고 깨끗한 색을 쓰면 딱딱함을 줄이면서도 맑은 인상을 줄 수 있어요.',
      tips: ['아이보리 셔츠나 밝은 니트로 얼굴 주변을 환하게 해보세요.', '치크는 작게, 립은 맑은 색으로 정리해보세요.'],
      title: '맑고 신뢰감 있는 출근 무드',
    },
    modern: {
      summary: '간결한 컬러 대비와 선명한 실루엣이 전문적이고 도시적인 인상을 만들어요.',
      tips: ['블랙이나 네이비 포인트를 한 곳에만 써보세요.', '액세서리는 얇고 직선적인 형태가 좋아요.'],
      title: '모던한 업무 포인트',
    },
    natural: {
      summary: '부드러운 색과 편안한 핏을 쓰면 부담은 낮추고 안정감은 유지할 수 있어요.',
      tips: ['차분한 니트, 셔츠, 코튼 재킷을 활용해보세요.', '헤어 볼륨은 과하지 않게 자연스럽게 정리하면 좋아요.'],
      title: '부드러운 출근 무드',
    },
  },
} as const satisfies Record<
  LocalBeautySituationAnalysisId,
  Record<LocalBeautySituationMood, {summary: string; tips: readonly string[]; title: string}>
>;

const situationLabels = {
  daily: '데일리',
  work: '출근',
  date: '데이트',
  photo: '사진',
} as const satisfies Record<LocalBeautySituationAnalysisId, string>;

const situationDetailPresentation = {
  daily: {
    color: '얼굴 가까운 상의나 니트에서 팔레트의 밝기와 채도를 먼저 맞추면 매일 입는 옷도 덜 밋밋해 보여요',
    makeup: '베이스는 얇게 유지하고 립/치크 중 하나만 생기 있게 두면 피로해 보이지 않으면서 자연스러워요',
    styling: '헤어와 패션은 손질이 오래 걸리는 디테일보다는 목선, 앞머리, 상의 길이처럼 반복해서 유지하기 쉬운 요소부터 맞추는 편이 좋아요.',
    tip: '데일리에서는 상의 색, 립 농도, 앞머리 볼륨 중 하나만 바꿔도 전체 인상이 꽤 달라져요.',
  },
  date: {
    color: '팔레트 안에서 얼굴이 부드러워 보이는 색을 쓰되, 너무 여러 색을 섞기보다 한 가지 포인트를 좁게 남기는 편이 좋아요',
    makeup: '피부결은 얇게 남기고 립이나 치크에 표정이 살아나는 정도의 혈색을 더하면 가까운 거리에서도 부담이 적어요',
    styling: '헤어와 패션은 곡선, 윤기, 소재의 움직임을 조금 남겨서 차가운 정돈감보다 편안한 호감도를 먼저 만드는 쪽이 안정적이에요.',
    tip: '데이트나 약속 전에는 립 컬러를 먼저 정하고 상의 색과 액세서리를 그 주변으로 맞춰보세요.',
  },
  photo: {
    color: '카메라에서는 실제보다 색이 눌리거나 뜰 수 있으니 팔레트의 핵심색을 얼굴 근처 한 지점에 더 분명히 두는 편이 좋아요',
    makeup: '조명에서 사라지기 쉬운 눈썹, 립 경계, 치크 위치를 평소보다 한 단계만 또렷하게 잡으면 사진 속 얼굴 중심이 살아나요',
    styling: '헤어와 패션은 실루엣이 흐려지지 않게 앞머리 방향, 어깨선, 상의 명도를 정리하고 배경색과 겹치지 않게 조절해보세요.',
    tip: '사진을 찍을 때는 배경색과 상의색이 너무 비슷하지 않은지 먼저 확인하면 얼굴이 더 잘 분리돼요.',
  },
  work: {
    color: '팔레트의 안정적인 기본색을 넓게 쓰고 포인트 컬러는 얼굴 가까운 작은 영역에만 두면 신뢰감과 생기를 같이 가져갈 수 있어요',
    makeup: '메이크업은 유행감보다 피부 정돈, 눈썹 경계, 립의 선명도를 균일하게 맞추는 쪽이 업무 상황에서 더 단단해 보여요',
    styling: '헤어와 패션은 어깨선, 목선, 옷의 구김처럼 첫인상을 좌우하는 선을 정리하고 장식은 필요한 만큼만 남기는 편이 좋아요.',
    tip: '출근이나 면접에서는 재킷/셔츠의 어깨선과 립 또는 눈썹의 경계감만 맞춰도 훨씬 정돈돼 보여요.',
  },
} as const satisfies Record<
  LocalBeautySituationAnalysisId,
  {color: string; makeup: string; styling: string; tip: string}
>;

export function analyzeLocalBeautySurvey(
  answers: Partial<Record<LocalBeautySurveyQuestionId, LocalBeautySurveyAnswerInput>>,
): LocalBeautySurveyResult {
  const seasonScores: WeightedScores<PersonalColorSeason> = {};
  const depthScores: WeightedScores<PersonalColorDepth> = {};
  const faceImageScores: WeightedScores<FaceImageType> = {};
  const hairScores: WeightedScores<HairRecommendationType> = {};
  const styleScores: WeightedScores<StyleRecommendationType> = {};
  const surveyAnswers: LocalBeautySurveyAnswers = {};
  const unknownQuestionIds: LocalBeautySurveyQuestionId[] = [];

  localBeautySurveyQuestions.forEach((question) => {
    const selectedOptionIds = normalizeLocalBeautySurveyAnswerOptionIds(
      answers[question.id],
      question.options.map(option => option.id),
    );
    const optionIds =
      selectedOptionIds.length > 0
        ? selectedOptionIds
        : [LOCAL_BEAUTY_UNKNOWN_OPTION_ID];

    surveyAnswers[question.id] = optionIds;

    if (optionIds.includes(LOCAL_BEAUTY_UNKNOWN_OPTION_ID)) {
      unknownQuestionIds.push(question.id);
      return;
    }

    const optionWeight = 1 / optionIds.length;

    optionIds.forEach((optionId) => {
      const option = question.options.find(nextOption => nextOption.id === optionId);
      const score = option?.score ?? optionScores[optionId] ?? {};

      addScores(seasonScores, score.season, optionWeight);
      addScores(depthScores, score.depth, optionWeight);
      addScores(faceImageScores, score.faceImage, optionWeight);
      addScores(hairScores, score.hair, optionWeight);
      addScores(styleScores, score.style, optionWeight);
    });
  });

  const seasonRankings = getScoreRankings(
    seasonScores,
    personalColorSeasonOrder,
    'neutral',
  );
  const season = seasonRankings[0]?.key ?? 'neutral';
  const depthRankings = getScoreRankings(
    depthScores,
    personalColorDepthOrder,
    season === 'winterCool' ? 'deep' : 'soft',
  );
  const depth = depthRankings[0]?.key ?? (season === 'winterCool' ? 'deep' : 'soft');
  const faceImageRankings = getScoreRankings(
    faceImageScores,
    faceImageTypeOrder,
    'natural',
  );
  const primaryType = faceImageRankings[0]?.key ?? 'natural';
  const secondaryTypes = getSecondaryFaceImageTypes(faceImageRankings, primaryType);
  const secondarySeason = getSecondaryScoreRankKey(seasonRankings, season);
  const secondaryFaceImageType = getSecondaryScoreRankKey(
    faceImageRankings,
    primaryType,
  );
  const hairType = getTopScoreKey<HairRecommendationType>(
    hairScores,
    hairFallbackByFaceImage[primaryType],
  );
  const styleType = getTopScoreKey<StyleRecommendationType>(
    styleScores,
    styleFallbackByFaceImage[primaryType],
  );
  const personalColorPresentation = seasonPresentation[season];
  const faceImage = faceImagePresentation[primaryType];
  const primaryPersonalColor = getLocalBeautyPersonalColorCandidate(season, depth);
  const secondaryPersonalColor = getLocalBeautyPersonalColorCandidate(
    secondarySeason,
    depth,
  );
  const personalColorResultMode: LocalBeautyResultMode =
    areTopScoreRanksSimilar(seasonRankings) ? 'mixed' : 'single';
  const personalColorBlend = getPersonalColorBlendPresentation(
    primaryPersonalColor,
    secondaryPersonalColor,
    personalColorResultMode,
  );
  const secondaryFaceImage = getLocalBeautyFaceImageCandidate(secondaryFaceImageType);
  const faceImageResultMode: LocalBeautyResultMode =
    areTopScoreRanksSimilar(faceImageRankings) ? 'mixed' : 'single';
  const faceImageBlend = getFaceImageBlendPresentation(
    primaryType,
    secondaryFaceImageType,
    faceImageResultMode,
  );
  const hairRecommendation = hairPresentation[hairType];
  const styleRecommendation = stylePresentation[styleType];
  const genderPresentation = getLocalBeautyGenderPresentation(surveyAnswers.gender);
  const hairTone = getFirstKnownAnswerOptionId(answers.hairTone) as HairToneOptionId;
  const hairColor = isHairToneOptionId(hairTone)
    ? hairColorByTone[hairTone]
    : getHairColorFallbackBySeason(season);
  const colorAnalysis = getLocalBeautyColorAnalysis({
    depth,
    depthScores,
    season,
    seasonScores,
  });
  const situationAnalysis = getLocalBeautySituationAnalysis(
    surveyAnswers,
    primaryType,
    season,
    depth,
    genderPresentation,
  );

  return {
    analyzedAt: new Date().toISOString(),
    avoidedMakeupNotes: avoidedNotesBySeason[season],
    faceImage: {
      blendLabel: faceImageBlend.label,
      blendSummary: faceImageBlend.summary,
      confidence: getConfidence(faceImageScores),
      keywords: faceImage.keywords,
      label: faceImage.label,
      primaryType,
      resultMode: faceImageResultMode,
      secondary: secondaryFaceImage,
      secondaryTypes,
      summary: faceImage.summary,
    },
    hairRecommendation: {
      color: hairColor,
      label: hairRecommendation.label,
      summary: `${hairRecommendation.summary} ${genderPresentation.hairSummary}`,
      tips: [...hairRecommendation.tips, genderPresentation.hairTip],
    },
    id: `local-beauty-survey-${Date.now()}`,
    personalColor: {
      blendLabel: personalColorBlend.label,
      blendSummary: personalColorBlend.summary,
      colorAnalysis,
      confidence: getConfidence(seasonScores),
      depth,
      label: `${personalColorPresentation.labelPrefix} ${depthLabel[depth]}`,
      palette: personalColorPresentation.palette,
      resultMode: personalColorResultMode,
      season,
      secondary: secondaryPersonalColor,
      summary: personalColorPresentation.summary,
    },
    recommendedMakeupIds: [`${season}-${depth}-daily`, `${primaryType}-mood-look`],
    recommendedMood: recommendedMoodBySeason[season],
    situationAnalysis,
    styleRecommendation: {
      fit: styleRecommendation.fit,
      label: styleRecommendation.label,
      silhouette: styleRecommendation.silhouette,
      summary: `${styleRecommendation.summary} ${genderPresentation.styleSummary}`,
      tips: [...styleRecommendation.tips, genderPresentation.styleTip],
    },
    surveyAnswers,
    unknownQuestionIds,
  };
}

function getFirstKnownAnswerOptionId(value: LocalBeautySurveyAnswerInput) {
  return normalizeLocalBeautySurveyAnswerOptionIds(value).find(
    optionId => optionId !== LOCAL_BEAUTY_UNKNOWN_OPTION_ID,
  );
}

function getLocalBeautyGenderPresentation(value: LocalBeautySurveyAnswerInput) {
  const optionId = getFirstKnownAnswerOptionId(value);

  if (optionId === 'genderFemale') {
    return genderPresentationByGender.female;
  }

  if (optionId === 'genderMale') {
    return genderPresentationByGender.male;
  }

  if (optionId === 'genderOther') {
    return genderPresentationByGender.other;
  }

  return genderPresentationByGender.unspecified;
}

function getLocalBeautyColorAnalysis({
  depth,
  depthScores,
  season,
  seasonScores,
}: {
  depth: PersonalColorDepth;
  depthScores: WeightedScores<PersonalColorDepth>;
  season: PersonalColorSeason;
  seasonScores: WeightedScores<PersonalColorSeason>;
}) {
  const warmScore = (seasonScores.springWarm ?? 0) + (seasonScores.autumnWarm ?? 0);
  const coolScore = (seasonScores.summerCool ?? 0) + (seasonScores.winterCool ?? 0);
  const neutralScore = seasonScores.neutral ?? 0;
  const lightValueScore = (depthScores.light ?? 0) + (depthScores.bright ?? 0);
  const deepValueScore = (depthScores.deep ?? 0) + (depthScores.clear ?? 0);
  const clearChromaScore = (depthScores.bright ?? 0) + (depthScores.clear ?? 0);
  const softChromaScore = (depthScores.mute ?? 0) + (depthScores.soft ?? 0);
  const axisScores = {
    chroma: Math.max(clearChromaScore, softChromaScore),
    neutralBalance: neutralScore + Math.min(warmScore, coolScore) * 0.35,
    temperature: Math.abs(warmScore - coolScore),
    value: Math.max(lightValueScore, deepValueScore),
  } satisfies Record<LocalBeautyColorAnalysisAxisId, number>;
  const priorityType =
    season === 'neutral'
      ? 'neutralBalance'
      : getTopScoreKey<LocalBeautyColorAnalysisAxisId>(axisScores, 'temperature');
  const presentation = colorAnalysisPresentation[priorityType];
  const maxAxisScore = Math.max(...Object.values(axisScores), 1);
  const neutralBalanceStrength = getAxisStrengthLabel(
    axisScores.neutralBalance,
    maxAxisScore,
  );
  const axes: LocalBeautyColorAnalysisAxis[] = [
    {
      id: 'temperature',
      label: '색온도',
      summary:
        warmScore === coolScore
          ? '웜/쿨을 강하게 나누기보다 중간 온도를 잡는 편이 좋아요.'
          : warmScore > coolScore
          ? '따뜻한 색감이 피부 생기와 부드러운 인상을 더 잘 살려요.'
          : '차가운 색감이 피부를 맑고 선명하게 정리해줘요.',
      value: getAxisStrengthLabel(axisScores.temperature, maxAxisScore),
    },
    {
      id: 'value',
      label: '명도',
      summary:
        depth === 'deep' || depth === 'clear'
          ? '밝게만 올리기보다 깊이와 대비를 남길수록 얼굴이 또렷해져요.'
          : '밝고 가벼운 색을 넓게 쓰면 얼굴이 더 편안하고 환해 보여요.',
      value: getAxisStrengthLabel(axisScores.value, maxAxisScore),
    },
    {
      id: 'chroma',
      label: '채도',
      summary:
        depth === 'mute' || depth === 'soft'
          ? '채도를 낮추고 부드럽게 블렌딩할수록 안정적인 타입이에요.'
          : '맑거나 선명한 채도를 좁게 살릴 때 얼굴 인상이 좋아져요.',
      value: getAxisStrengthLabel(axisScores.chroma, maxAxisScore),
    },
    {
      id: 'neutralBalance',
      label: '뉴트럴',
      summary: getNeutralBalanceAxisSummary(season, neutralBalanceStrength),
      value: neutralBalanceStrength,
    },
  ];

  return {
    axes,
    priorityLabel: presentation.label,
    prioritySummary: presentation.summary,
    priorityType,
  };
}

function getNeutralBalanceAxisSummary(
  season: PersonalColorSeason,
  strength: string,
) {
  if (season === 'neutral' || strength === '높음') {
    return '웜/쿨 한쪽으로 치우치지 않는 중간 온도 균형이 핵심이에요. 베이지, 로즈 베이지, 뉴트럴 브라운처럼 노란기와 푸른기 사이의 색이 안정적이에요.';
  }

  if (strength === '중간') {
    return '메인 톤은 있지만 중간 온도 색도 일부 받아요. 기본템은 뉴트럴하게 두고 립, 치크, 상의 포인트만 메인 톤으로 맞추면 안정적이에요.';
  }

  return '뉴트럴 소화력은 낮게 나왔어요. 중간색을 메인으로 두기보다 지금 잡힌 메인 톤을 더 분명히 가져가는 편이 얼굴 인상이 안정적이에요.';
}

function getAxisStrengthLabel(score: number, maxScore: number) {
  const ratio = maxScore > 0 ? score / maxScore : 0;

  if (ratio >= 0.72) {
    return '높음';
  }

  if (ratio >= 0.42) {
    return '중간';
  }

  return '낮음';
}

function getLocalBeautySituationAnalysis(
  answers: LocalBeautySurveyAnswers,
  primaryType: FaceImageType,
  season: PersonalColorSeason,
  depth: PersonalColorDepth,
  genderPresentation: LocalBeautyGenderPresentation,
) {
  return (Object.keys(situationQuestionPrefixes) as LocalBeautySituationAnalysisId[]).map(
    (situationId) => {
      const mood = getSituationMoodFromAnswers(
        answers,
        situationQuestionPrefixes[situationId],
        situationMoodFallbackByFaceImage[primaryType],
      );
      const presentation = situationMoodPresentation[situationId][mood];

      return {
        id: situationId,
        label: situationLabels[situationId],
        summary: getDetailedSituationSummary({
          depth,
          genderPresentation,
          presentationSummary: presentation.summary,
          season,
          situationId,
        }),
        tips: [
          ...presentation.tips,
          situationDetailPresentation[situationId].tip,
          genderPresentation.situationTip,
        ],
        title: presentation.title,
      };
    },
  );
}

function getDetailedSituationSummary({
  depth,
  genderPresentation,
  presentationSummary,
  season,
  situationId,
}: {
  depth: PersonalColorDepth;
  genderPresentation: LocalBeautyGenderPresentation;
  presentationSummary: string;
  season: PersonalColorSeason;
  situationId: LocalBeautySituationAnalysisId;
}) {
  const detail = situationDetailPresentation[situationId];
  const colorLabel = `${seasonPresentation[season].labelPrefix} ${depthLabel[depth]}`;

  return `${presentationSummary} 컬러는 ${colorLabel} 팔레트 안에서 ${detail.color}. 메이크업은 ${detail.makeup}. 헤어/패션은 ${detail.styling} ${genderPresentation.situationSummary}`;
}

function getSituationMoodFromAnswers(
  answers: LocalBeautySurveyAnswers,
  questionPrefix: string,
  fallback: LocalBeautySituationMood,
) {
  const moodScores: WeightedScores<LocalBeautySituationMood> = {};

  Object.entries(answers).forEach(([questionId, optionIds]) => {
    if (!questionId.startsWith(questionPrefix)) {
      return;
    }

    optionIds.forEach((optionId) => {
      const mood = getSituationMoodFromOptionId(optionId);

      if (!mood) {
        return;
      }

      moodScores[mood] = (moodScores[mood] ?? 0) + 1 / optionIds.length;
    });
  });

  return getTopScoreKey<LocalBeautySituationMood>(moodScores, fallback);
}

function getSituationMoodFromOptionId(
  optionId: LocalBeautySurveyOptionId,
): LocalBeautySituationMood | null {
  if (optionId.includes('detailImageLovelyFresh')) {
    return 'fresh';
  }

  if (optionId.includes('detailImageSoftNatural')) {
    return 'natural';
  }

  if (optionId.includes('detailImageClassicTrust')) {
    return 'classic';
  }

  if (optionId.includes('detailImageChicModern')) {
    return 'modern';
  }

  return null;
}

function isHairToneOptionId(value: unknown): value is HairToneOptionId {
  return value === 'ashBrown' || value === 'deepBlack' || value === 'softBlack' || value === 'warmBrown';
}

function getHairColorFallbackBySeason(season: PersonalColorSeason) {
  if (season === 'springWarm') {
    return hairColorByTone.warmBrown;
  }

  if (season === 'summerCool') {
    return hairColorByTone.ashBrown;
  }

  if (season === 'winterCool') {
    return hairColorByTone.deepBlack;
  }

  return hairColorByTone.softBlack;
}

function addScores<Key extends string>(
  target: WeightedScores<Key>,
  source: WeightedScores<Key> | undefined,
  weight = 1,
) {
  if (!source) {
    return;
  }

  (Object.keys(source) as Key[]).forEach((scoreKey) => {
    const value = source[scoreKey];

    if (typeof value !== 'number') {
      return;
    }

    target[scoreKey] = (target[scoreKey] ?? 0) + value * weight;
  });
}

function getLocalBeautyPersonalColorCandidate(
  season: PersonalColorSeason,
  depth: PersonalColorDepth,
): LocalBeautyPersonalColorCandidate {
  const presentation = seasonPresentation[season];

  return {
    depth,
    label: `${presentation.labelPrefix} ${depthLabel[depth]}`,
    season,
    summary: presentation.summary,
  };
}

function getLocalBeautyFaceImageCandidate(
  type: FaceImageType,
): LocalBeautyFaceImageCandidate {
  const presentation = faceImagePresentation[type];

  return {
    label: faceImageShortLabel[type],
    summary: presentation.summary,
    type,
  };
}

function getPersonalColorBlendPresentation(
  primary: LocalBeautyPersonalColorCandidate,
  secondary: LocalBeautyPersonalColorCandidate,
  mode: LocalBeautyResultMode,
) {
  if (mode === 'mixed') {
    return {
      label: `${primary.label} + ${secondary.label} 믹스`,
      summary: `${primary.label}가 1순위지만 ${secondary.label} 단서도 가까워요. 베이스는 ${primary.label}의 팔레트를 기준으로 잡고, 립이나 상의처럼 얼굴 가까운 한 지점에 2순위 컬러를 좁게 섞으면 답변 경향을 더 자연스럽게 살릴 수 있어요.`,
    };
  }

  return {
    label: primary.label,
    summary: `${primary.label} 단서가 가장 뚜렷해요. 2순위인 ${secondary.label}는 메인 팔레트가 너무 강하거나 약하게 느껴질 때 밝기와 채도를 미세 조정하는 보조 기준으로 보면 좋아요.`,
  };
}

function getFaceImageBlendPresentation(
  primaryType: FaceImageType,
  secondaryType: FaceImageType,
  mode: LocalBeautyResultMode,
) {
  const primaryLabel = faceImageShortLabel[primaryType];
  const secondaryLabel = faceImageShortLabel[secondaryType];

  if (mode === 'mixed') {
    return {
      label: `${primaryLabel} + ${secondaryLabel} 혼합 이미지`,
      summary: `${primaryLabel} 이미지가 1순위지만 ${secondaryLabel} 분위기도 비슷하게 올라왔어요. 메이크업과 헤어의 첫인상은 1순위처럼 잡고, 액세서리·소재·립 질감에서 2순위 무드를 조금 섞으면 얼굴 분위기가 단조롭지 않게 정리됩니다.`,
    };
  }

  return {
    label: faceImagePresentation[primaryType].label,
    summary: `${primaryLabel} 이미지가 가장 안정적인 중심축이에요. 2순위인 ${secondaryLabel} 무드는 상황에 따라 포인트로만 더하면 전체 인상이 흔들리지 않습니다.`,
  };
}

function getScoreRankings<Key extends string>(
  scores: WeightedScores<Key>,
  candidates: readonly Key[],
  fallback: Key,
): readonly ScoreRank<Key>[] {
  const ranks = candidates.map(key => ({
    key,
    score: scores[key] ?? 0,
  }));
  const hasPositiveScore = ranks.some(rank => rank.score > 0);

  if (!hasPositiveScore) {
    return [
      ...ranks.filter(rank => rank.key === fallback),
      ...ranks.filter(rank => rank.key !== fallback),
    ];
  }

  return ranks.sort((first, second) => second.score - first.score);
}

function getSecondaryScoreRankKey<Key extends string>(
  ranks: readonly ScoreRank<Key>[],
  primary: Key,
) {
  return ranks.find(rank => rank.key !== primary)?.key ?? primary;
}

function areTopScoreRanksSimilar<Key extends string>(
  ranks: readonly ScoreRank<Key>[],
) {
  const topRank = ranks[0];
  const secondRank = topRank
    ? ranks.find(rank => rank.key !== topRank.key)
    : undefined;

  if (!topRank || !secondRank || topRank.score <= 0 || secondRank.score <= 0) {
    return false;
  }

  return secondRank.score / topRank.score >= localBeautyMixedScoreRatio;
}

function getTopScoreKey<Key extends string>(
  scores: WeightedScores<Key>,
  fallback: Key,
): Key {
  const entries = Object.entries(scores) as [Key, number][];

  if (entries.length === 0) {
    return fallback;
  }

  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

function getConfidence<Key extends string>(scores: WeightedScores<Key>) {
  const values = Object.values(scores) as number[];
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(...values, 0);

  if (total <= 0) {
    return 0.5;
  }

  return Math.max(0.5, Math.min(0.96, Number((max / total).toFixed(2))));
}

function getSecondaryFaceImageTypes(
  ranks: readonly ScoreRank<FaceImageType>[],
  primaryType: FaceImageType,
) {
  return ranks
    .filter(rank => rank.key !== primaryType)
    .slice(0, 2)
    .map(rank => rank.key);
}
