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

const moodDescriptionBySeason = {
  autumnWarm:
    '소프트 브라운 무드는 베이지, 카멜, 로즈 브라운처럼 온기가 낮게 깔린 색으로 얼굴의 깊이를 만드는 방향입니다. 광을 강하게 번쩍이게 하기보다 새틴이나 세미매트 질감으로 음영을 얇게 쌓으면 차분한 고급스러움이 살아나요.',
  neutral:
    '뉴트럴 소프트 글로우는 웜/쿨을 세게 가르기보다 피부와 입술 사이의 자연스러운 연결을 살리는 무드입니다. 아이보리, 로즈 베이지, 뉴트럴 브라운처럼 중간 온도의 색을 쓰고, 광은 얇게 남겨 맑지만 과하지 않은 인상을 만드는 쪽이 좋아요.',
  springWarm:
    '맑은 코랄 글로우는 피치, 코랄, 아이보리처럼 밝고 투명한 색으로 얼굴의 생기와 가벼움을 먼저 살리는 무드입니다. 색을 두껍게 얹기보다 얇은 베이스, 작은 치크, 맑은 립 광을 연결하면 산뜻하고 친근한 이미지가 잘 살아나요.',
  summerCool:
    '뮤트 로즈 데일리는 로즈, 라벤더, 소프트 핑크처럼 차갑지만 부드러운 색을 낮은 대비로 연결하는 무드입니다. 선을 강하게 세우기보다 베이스의 붉은기와 노란기를 정돈하고, 립과 치크를 은은하게 이어 피부가 깨끗해 보이게 만드는 방향이에요.',
  winterCool:
    '플럼 모브 포인트는 차가운 플럼, 모브, 버건디 계열을 좁은 면적에 또렷하게 쓰는 무드입니다. 전체를 진하게 칠하기보다 피부 밝기를 균일하게 정리한 뒤 립, 눈매, 의상 중 한 곳에 대비를 남기면 세련된 존재감이 살아나요.',
} as const satisfies Record<PersonalColorSeason, string>;

const seasonDetailBySeason = {
  autumnWarm: '따뜻한 브라운, 베이지, 올리브처럼 노란기와 흙빛이 섞인 색에서 피부 결이 차분하게 정리되는 경향입니다.',
  neutral: '웜/쿨 한쪽보다 밝기, 채도, 대비의 균형이 먼저 보이는 타입입니다. 색온도는 중간값을 두고 소재와 농도를 조절하는 편이 안정적입니다.',
  springWarm: '밝은 피치, 아이보리, 코랄처럼 따뜻하고 맑은 색에서 혈색과 투명감이 살아나는 경향입니다.',
  summerCool: '로즈, 라벤더, 소프트 블루처럼 차갑고 부드러운 색에서 붉은기와 노란기가 정돈되어 보이는 경향입니다.',
  winterCool: '블랙, 화이트, 플럼, 버건디처럼 차갑고 대비가 있는 색에서 얼굴 윤곽과 이목구비가 또렷해지는 경향입니다.',
} as const satisfies Record<PersonalColorSeason, string>;

const depthDetailByDepth = {
  bright: '브라이트는 탁한 색보다 맑은 채도가 중요합니다. 다만 넓은 면적 전체를 진하게 쓰기보다 립, 치크, 상의 중 한 곳에 산뜻한 포인트를 두는 방식이 안전합니다.',
  clear: '클리어는 색이 흐려지면 인상이 약해질 수 있어요. 명암 대비와 깨끗한 경계를 남기되, 베이스는 두껍게 올리지 않는 편이 좋습니다.',
  deep: '딥은 밝게만 띄우는 것보다 깊이와 그림자를 남길수록 안정적입니다. 검정이나 진한 와인색은 넓게 쓰기보다 얼굴 가까운 포인트로 쓰면 세련도가 올라갑니다.',
  light: '라이트는 밝고 가벼운 색을 넓게 써도 얼굴이 편안해 보이는 축입니다. 색을 진하게 쌓기보다 투명도와 밝기를 먼저 맞추는 편이 좋습니다.',
  mute: '뮤트는 채도를 낮춘 색을 여러 겹 얇게 쌓을 때 안정적인 축입니다. 형광기나 강한 대비를 줄이고, 질감은 보송하거나 새틴에 가깝게 두면 좋습니다.',
  soft: '소프트는 강한 경계보다 부드러운 연결이 중요합니다. 립과 치크, 헤어와 의상의 색 차이를 크게 벌리지 않으면 전체 인상이 편안해집니다.',
} as const satisfies Record<PersonalColorDepth, string>;

const imageDetailByType = {
  chic: '시크 타입은 선, 대비, 여백을 다룰 때 장점이 커집니다. 라인을 흐리기보다 눈매, 립, 헤어 윤기처럼 한 지점을 정확히 잡으면 얼굴의 존재감이 살아납니다.',
  classic: '클래식 타입은 정돈감과 균형이 핵심입니다. 색이나 장식을 많이 더하기보다 눈썹, 립 경계, 의상 실루엣을 일정하게 맞출 때 신뢰감과 고급스러움이 잘 보입니다.',
  clean: '맑은 타입은 두꺼운 표현보다 투명도와 산뜻함이 중요합니다. 베이스, 치크, 립을 얇게 연결하면 깨끗한 인상이 유지됩니다.',
  lovely: '러블리 타입은 작은 곡선과 밝은 생기 포인트가 장점입니다. 과한 장식보다 둥근 디테일, 촉촉한 립, 작은 액세서리처럼 가까운 요소를 부드럽게 잡는 편이 좋습니다.',
  modern: '모던 타입은 색 수를 줄이고 구조를 남길수록 강점이 살아납니다. 직선적인 헤어, 간결한 의상, 선명한 한 포인트를 조합하면 이미지가 명확해집니다.',
  natural: '내추럴 타입은 꾸민 흔적보다 결, 여유, 소재감이 중요합니다. 피부와 헤어의 자연스러운 질감을 살리고 핏은 몸에서 살짝 떨어뜨리면 편안한 매력이 유지됩니다.',
  soft: '소프트 타입은 낮은 대비와 흐린 경계에서 장점이 커집니다. 블러 립, 은은한 음영, 부드러운 소재처럼 선을 누그러뜨리는 요소가 잘 맞습니다.',
} as const satisfies Record<FaceImageType, string>;

export function getLocalBeautyResultDetailCards(
  result: LocalBeautySurveyResult,
): readonly LocalBeautyResultDetailCard[] {
  return [
    {
      body: getLocalBeautyColorDetailBody(result),
      title: '컬러 핵심',
      value: getLocalBeautyDisplayColorLabel(result),
    },
    {
      body: getLocalBeautyImageDetailBody(result),
      title: '이미지 핵심',
      value: getLocalBeautyDisplayImageLabel(result),
    },
    {
      body: getLocalBeautyDirectionDetailBody(result),
      title: '추천 방향',
      value: result.recommendedMood,
    },
    {
      body: getLocalBeautyHairDetailBody(result),
      title: '헤어 분석',
      value: result.hairRecommendation.label,
    },
    {
      body: getLocalBeautyStyleDetailBody(result),
      title: '패션 분석',
      value: result.styleRecommendation.label,
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

export function getLocalBeautyRecommendedMoodDescription(
  result: LocalBeautySurveyResult,
) {
  const imageLabel = getLocalBeautyDisplayImageLabel(result);

  return `${moodDescriptionBySeason[result.personalColor.season]} 이번 결과에서는 ${getLocalBeautyDisplayColorLabel(result)}와 ${imageLabel}가 함께 보이기 때문에, 메이크업은 색을 많이 늘리기보다 핵심 포인트 하나를 정하고 헤어와 옷의 선을 같은 무드로 맞추는 편이 안정적입니다.`;
}

export function getLocalBeautyRecentResultCards(
  results: readonly LocalBeautySurveyResult[],
): readonly LocalBeautyRecentResultCard[] {
  return results.map(result => ({
    meta: formatLocalBeautyResultDate(result.analyzedAt),
    resultId: result.id,
    subtitle: `${getLocalBeautyDisplayImageLabel(result)} · ${result.recommendedMood}`,
    swatches: result.personalColor.palette.slice(0, 3),
    title: getLocalBeautyDisplayColorLabel(result),
  }));
}

function formatLocalBeautyResultDate(value: string) {
  return value.slice(0, 10).replace(/-/g, '.');
}

function getLocalBeautyColorDetailBody(result: LocalBeautySurveyResult) {
  const axisSummary = result.personalColor.colorAnalysis.axes
    .map(axis => `${axis.label} ${axis.value}`)
    .join(', ');
  const secondaryLabel = getLocalBeautySecondaryColorLabel(result);
  const blendSummary =
    result.personalColor.blendSummary ??
    `${result.personalColor.label}가 중심이지만 ${secondaryLabel}도 보조 기준으로 함께 참고하면 좋아요.`;

  return `${getLocalBeautyDisplayColorLabel(result)} 결과는 ${seasonDetailBySeason[result.personalColor.season]} 세부 깊이는 ${depthDetailByDepth[result.personalColor.depth]} 2순위 컬러 후보는 ${secondaryLabel}입니다. ${blendSummary} 이번 답변에서는 ${result.personalColor.colorAnalysis.priorityLabel}이 가장 큰 판단 축으로 잡혔고, 세부 축 강도는 ${axisSummary}입니다. 먼저 상의 색이나 립 색 중 하나만 바꿔 피부가 노랗게 뜨는지, 입술 경계가 또렷해지는지, 얼굴보다 색이 먼저 보이는지 확인해보세요. 다음에는 같은 색이라도 밝기와 채도 면적을 조절해보고, 마지막에는 웜/쿨 온도를 미세하게 바꿔 전체 인상이 더 맑아지는 지점을 찾으면 좋아요.`;
}

function getLocalBeautyImageDetailBody(result: LocalBeautySurveyResult) {
  const secondaryTypeLabel = getLocalBeautySecondaryImageLabel(result);
  const keywordLabel = result.faceImage.keywords.join(', ');
  const blendSummary =
    result.faceImage.blendSummary ??
    `${getLocalBeautyImageTypeLabel(result.faceImage.primaryType)} 이미지를 중심으로 두고 ${secondaryTypeLabel} 무드를 포인트로 섞으면 좋아요.`;

  return `${getLocalBeautyDisplayImageLabel(result)}는 ${imageDetailByType[result.faceImage.primaryType]} 이번 결과의 주요 단서는 ${keywordLabel}이고, 2순위 이미지는 ${secondaryTypeLabel}입니다. ${blendSummary} 먼저 얼굴에서 가장 먼저 보이게 할 요소를 하나만 정해보세요. 눈매라면 아이라인과 눈썹, 입술이라면 립 경계와 채도, 헤어라면 윤기와 가르마가 기준이 됩니다. 다음에는 곡선/직선, 광택/매트, 여백/장식 중 하나를 더 조절하고, 마지막에는 메이크업·헤어·옷에서 같은 선과 질감이 반복되도록 맞추면 이미지가 훨씬 선명해집니다.`;
}

function getLocalBeautyDirectionDetailBody(result: LocalBeautySurveyResult) {
  return `${result.recommendedMood} 방향은 ${getLocalBeautyDisplayColorLabel(result)}의 색감과 ${getLocalBeautyDisplayImageLabel(result)}를 같이 맞춘 스타일링 기준입니다. 먼저 메이크업은 ${result.personalColor.colorAnalysis.priorityLabel}을 중심으로 립이나 치크 한 곳에만 포인트를 주세요. 다음에는 헤어를 ${result.hairRecommendation.label} 방향으로 맞춰 ${result.hairRecommendation.summary} 마지막에는 패션을 ${result.styleRecommendation.label} 기준으로 정리하고 ${result.styleRecommendation.fit}을 맞추면 컬러, 헤어, 옷이 따로 놀지 않고 하나의 무드로 이어집니다.`;
}

function getLocalBeautyHairDetailBody(result: LocalBeautySurveyResult) {
  return `${result.hairRecommendation.label} 추천은 얼굴 이미지의 선명도와 헤어가 만드는 첫인상 균형을 함께 본 결과입니다. 먼저 컬러는 ${result.hairRecommendation.color}처럼 피부 톤과 대비를 맞추는 방향이 안정적이고, 형태는 ${result.hairRecommendation.summary} 다음에는 앞머리, 가르마, 얼굴 옆머리를 시선이 시작되는 프레임으로 보고 ${result.hairRecommendation.tips.join(' ')} 마지막에는 모발 밝기, 뿌리 볼륨, 끝선의 무게, 윤기 표현을 따로 조절해 같은 헤어라도 데일리와 촬영용 강도를 나눠보면 완성도가 올라갑니다.`;
}

function getLocalBeautyStyleDetailBody(result: LocalBeautySurveyResult) {
  return `${result.styleRecommendation.label}은 체형을 하나로 단정하기보다 얼굴 이미지와 옷의 구조가 충돌하지 않게 맞춘 패션 방향입니다. 먼저 핵심 핏은 ${result.styleRecommendation.fit}이고, 전체 실루엣은 ${result.styleRecommendation.silhouette} 쪽이 안정적입니다. 다음에는 어깨선, 허리 위치, 하의의 세로선, 소재 두께 중 하나만 바꿔 ${result.styleRecommendation.summary} 마지막에는 ${result.styleRecommendation.tips.join(' ')} 포인트를 여러 곳에 흩뿌리기보다 상의 컬러, 재킷 구조, 액세서리 중 하나만 크게 두고 나머지는 반복되는 선으로 정리하면 좋아요.`;
}

function getLocalBeautyDisplayColorLabel(result: LocalBeautySurveyResult) {
  return result.personalColor.blendLabel ?? result.personalColor.label;
}

function getLocalBeautyDisplayImageLabel(result: LocalBeautySurveyResult) {
  return result.faceImage.blendLabel ?? result.faceImage.label;
}

function getLocalBeautySecondaryColorLabel(result: LocalBeautySurveyResult) {
  return result.personalColor.secondary?.label ?? '현재 결과와 가까운 보조 톤';
}

function getLocalBeautySecondaryImageLabel(result: LocalBeautySurveyResult) {
  if (result.faceImage.secondary) {
    return result.faceImage.secondary.label;
  }

  if (result.faceImage.secondaryTypes.length > 0) {
    return result.faceImage.secondaryTypes.map(getLocalBeautyImageTypeLabel).join(', ');
  }

  return '균형형';
}
