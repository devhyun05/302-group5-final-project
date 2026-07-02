import {
  LOCAL_BEAUTY_MAX_SELECTED_OPTIONS,
  LOCAL_BEAUTY_UNKNOWN_OPTION_ID,
  LOCAL_BEAUTY_UNKNOWN_OPTION_DESCRIPTION,
  analyzeLocalBeautySurvey,
  localBeautySurveyQuestions,
  normalizeLocalBeautySurveyAnswerOptionIds,
} from './localBeautySurveyScoring';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const warmLightResult = analyzeLocalBeautySurvey({
  skinReaction: 'brightPeach',
  jewelryTone: 'gold',
  bestColors: 'clearWarm',
  makeupTone: 'coralPeach',
  contrast: 'softLight',
  impression: 'cleanLovely',
  imageLine: 'roundedSoft',
  imagePace: 'airyFresh',
  imageDetail: 'glossyLight',
  undertoneClue: 'warmVein',
  sunReaction: 'goldenTan',
  hairTone: 'warmBrown',
  hairLength: 'softBob',
  hairStyling: 'lightWave',
  hairParting: 'airyBangs',
  hairVolume: 'sideLightVolume',
  bodyFitBalance: 'waistDefinedBalance',
  topFit: 'fittedRibTop',
  bottomFit: 'aLineBottom',
  waistStyling: 'highWaistLine',
  fashionSilhouette: 'softCompactSilhouette',
  fashionMood: 'romanticFreshMood',
  patternScale: 'smallPrintPattern',
  layeringStyle: 'lightLayering',
  imageKeyword: 'freshFriendlyKeyword',
  occasionStyle: 'dateSoftOccasion',
  eyeContrast: 'clearBrown',
  colorSaturation: 'lightClear',
  patternMood: 'delicateDetail',
  accessoryScale: 'smallSoft',
  fabricTexture: 'sheerGlossy',
  browLine: 'softArch',
  lipBoundary: 'glossTint',
  overallPreference: 'warmFresh',
});

expectEqual(
  localBeautySurveyQuestions.length > 100,
  true,
  'survey question count supports detailed analysis',
);
expectEqual(
  localBeautySurveyQuestions.every(question =>
    question.options.some(option => option.id === LOCAL_BEAUTY_UNKNOWN_OPTION_ID),
  ),
  true,
  'every survey question has unknown option',
);
expectEqual(
  localBeautySurveyQuestions.every(question =>
    question.options.some(option =>
      option.id === LOCAL_BEAUTY_UNKNOWN_OPTION_ID &&
      option.description === LOCAL_BEAUTY_UNKNOWN_OPTION_DESCRIPTION,
    ),
  ),
  true,
  'every survey question uses shared unknown description',
);
expectEqual(
  localBeautySurveyQuestions.every(question => question.unknownGuide.length > 20),
  true,
  'every survey question has unknown guide',
);
expectEqual(
  new Set(localBeautySurveyQuestions.map(question => question.unknownGuide)).size,
  localBeautySurveyQuestions.length,
  'every survey question has a unique unknown guide',
);
expectEqual(
  localBeautySurveyQuestions.some(question =>
    question.unknownGuide.includes(question.title.replace(/[?？]$/, '')),
  ),
  false,
  'survey question unknown guides do not repeat their own title',
);
expectEqual(
  LOCAL_BEAUTY_MAX_SELECTED_OPTIONS,
  2,
  'survey answers allow up to two selected options',
);
expectEqual(
  normalizeLocalBeautySurveyAnswerOptionIds([
    'brightPeach',
    'pinkCool',
    'clearContrast',
  ]).join(','),
  'brightPeach,pinkCool',
  'survey answer normalization keeps only two known options',
);
expectEqual(
  normalizeLocalBeautySurveyAnswerOptionIds([
    LOCAL_BEAUTY_UNKNOWN_OPTION_ID,
    'brightPeach',
  ]).join(','),
  'brightPeach',
  'known option wins when normalized with unknown option',
);
expectEqual(
  localBeautySurveyQuestions.find(question => question.id === 'skinReaction')?.unknownGuide.startsWith(
    '확인법: 낮 시간 창가 자연광에서',
  ),
  true,
  'color unknown guide starts directly with the checking method',
);
expectEqual(
  warmLightResult.personalColor.label,
  '봄웜 라이트',
  'warm light personal color label',
);
expectEqual(
  warmLightResult.personalColor.season,
  'springWarm',
  'warm light personal color season',
);
expectEqual(
  warmLightResult.faceImage.label,
  '맑고 러블리한 이미지',
  'warm light face image label',
);
expectEqual(
  warmLightResult.recommendedMood,
  '맑은 코랄 글로우',
  'warm light recommended mood',
);
expectEqual(
  warmLightResult.hairRecommendation.label,
  '소프트 레이어드 보브',
  'warm light hair recommendation label',
);
expectEqual(
  warmLightResult.styleRecommendation.label,
  '라이트 로맨틱 무드',
  'warm light style recommendation label',
);
expectEqual(
  warmLightResult.surveyAnswers.skinReaction?.join(','),
  'brightPeach',
  'survey answers are stored as option id arrays',
);
expectEqual(
  warmLightResult.personalColor.colorAnalysis.axes.map(axis => axis.label).join('/'),
  '색온도/명도/채도/뉴트럴',
  'warm light result includes detailed color analysis axes',
);
expectEqual(
  warmLightResult.situationAnalysis.map(item => item.id).join('/'),
  'daily/work/date/photo',
  'warm light result includes all situation analyses',
);

const neutralBalancedResult = analyzeLocalBeautySurvey({
  jewelryTone: 'both',
  contrast: 'mediumNatural',
  undertoneClue: 'neutralVein',
  sunReaction: 'staysEven',
  hairTone: 'softBlack',
  colorSaturation: 'neutralBalanced',
});

expectEqual(
  neutralBalancedResult.personalColor.season,
  'neutral',
  'neutral balanced personal color season',
);
expectEqual(
  neutralBalancedResult.personalColor.colorAnalysis.priorityType,
  'neutralBalance',
  'neutral result prioritizes neutral balance analysis',
);

const multiSelectedResult = analyzeLocalBeautySurvey({
  skinReaction: ['brightPeach', 'pinkCool', 'clearContrast'],
  bestColors: ['clearWarm', 'powderCool'],
  detailDailyMoodR1: [
    'detailDailyMoodR1-detailImageLovelyFresh',
    'detailDailyMoodR1-detailImageSoftNatural',
  ],
  detailDateMoodR1: 'detailDateMoodR1-detailImageSoftNatural',
  detailPhotoMoodR1: 'detailPhotoMoodR1-detailImageChicModern',
  detailWorkMoodR1: 'detailWorkMoodR1-detailImageClassicTrust',
});

expectEqual(
  multiSelectedResult.surveyAnswers.skinReaction?.join(','),
  'brightPeach,pinkCool',
  'survey analysis stores the first two selected options',
);
expectEqual(
  multiSelectedResult.unknownQuestionIds.includes('skinReaction'),
  false,
  'multi selected known answer is not tracked as unknown',
);
expectEqual(
  multiSelectedResult.situationAnalysis.find(item => item.id === 'daily')?.label,
  '데일리',
  'multi selected result includes daily situation analysis',
);
expectEqual(
  multiSelectedResult.situationAnalysis.find(item => item.id === 'work')?.title,
  '단정한 출근/면접 무드',
  'work situation can use the work mood answer',
);

const unknownTrackedResult = analyzeLocalBeautySurvey({
  ...warmLightResult.surveyAnswers,
  fashionMood: LOCAL_BEAUTY_UNKNOWN_OPTION_ID,
  hairTone: LOCAL_BEAUTY_UNKNOWN_OPTION_ID,
});

expectEqual(
  unknownTrackedResult.unknownQuestionIds.includes('fashionMood'),
  true,
  'unknown fashion answer is tracked',
);
expectEqual(
  unknownTrackedResult.unknownQuestionIds.includes('hairTone'),
  true,
  'unknown hair tone answer is tracked',
);
expectEqual(
  Boolean(unknownTrackedResult.hairRecommendation.color),
  true,
  'unknown hair tone still has fallback color',
);

const mutedClassicResult = analyzeLocalBeautySurvey({
  skinReaction: 'calmBeige',
  jewelryTone: 'gold',
  bestColors: 'mutedEarth',
  makeupTone: 'roseBrown',
  contrast: 'lowSoft',
  impression: 'classicNatural',
  imageLine: 'calmStraight',
  imagePace: 'refinedClassic',
  imageDetail: 'structuredMatte',
  undertoneClue: 'neutralVein',
  sunReaction: 'oliveTan',
  hairTone: 'ashBrown',
  hairLength: 'mediumLayer',
  hairStyling: 'cCurveVolume',
  hairParting: 'sidePartVolume',
  hairVolume: 'lowCalmVolume',
  bodyFitBalance: 'waistDefinedBalance',
  topFit: 'structuredBlazerTop',
  bottomFit: 'longColumnBottom',
  waistStyling: 'tuckedCleanLine',
  fashionSilhouette: 'classicIlineSilhouette',
  fashionMood: 'elegantQuietMood',
  patternScale: 'stripeCheckPattern',
  layeringStyle: 'tailoredLayering',
  imageKeyword: 'refinedTrustKeyword',
  occasionStyle: 'officeCleanOccasion',
  eyeContrast: 'mutedGray',
  colorSaturation: 'mutedSoft',
  patternMood: 'classicTailored',
  accessoryScale: 'refinedSimple',
  fabricTexture: 'suedeMatte',
  browLine: 'straightNatural',
  lipBoundary: 'satinNatural',
  overallPreference: 'earthyElegant',
});

expectEqual(
  mutedClassicResult.personalColor.label,
  '가을웜 뮤트',
  'muted classic personal color label',
);
expectEqual(
  mutedClassicResult.faceImage.label,
  '차분하고 클래식한 이미지',
  'muted classic face image label',
);
expectEqual(
  mutedClassicResult.personalColor.confidence > 0.7,
  true,
  'muted classic confidence',
);
expectEqual(
  mutedClassicResult.hairRecommendation.color,
  '애쉬 브라운이나 소프트 다크 브라운',
  'muted classic hair color',
);
expectEqual(
  mutedClassicResult.styleRecommendation.fit,
  '허리선과 어깨선을 단정하게 잡는 테일러드 핏',
  'muted classic style fit',
);

const chicModernResult = analyzeLocalBeautySurvey({
  skinReaction: 'clearContrast',
  jewelryTone: 'silver',
  bestColors: 'vividMono',
  makeupTone: 'berryRed',
  contrast: 'highClear',
  impression: 'chicModern',
  imageLine: 'definedSharp',
  imagePace: 'boldMinimal',
  imageDetail: 'sharpPoint',
  undertoneClue: 'coolVein',
  sunReaction: 'redEasily',
  hairTone: 'deepBlack',
  hairLength: 'sleekLong',
  hairStyling: 'straightGloss',
  hairParting: 'noBangsSleek',
  hairVolume: 'flatSleekLine',
  bodyFitBalance: 'shoulderStructuredBalance',
  topFit: 'structuredBlazerTop',
  bottomFit: 'longColumnBottom',
  waistStyling: 'tuckedCleanLine',
  fashionSilhouette: 'modernSharpSilhouette',
  fashionMood: 'urbanStatementMood',
  patternScale: 'boldGraphicPattern',
  layeringStyle: 'contrastLayering',
  imageKeyword: 'boldPresenceKeyword',
  occasionStyle: 'eveningPointOccasion',
  eyeContrast: 'deepContrast',
  colorSaturation: 'deepRich',
  patternMood: 'minimalStatement',
  accessoryScale: 'boldSharp',
  fabricTexture: 'crispLeather',
  browLine: 'sharpDefined',
  lipBoundary: 'clearFull',
  overallPreference: 'statementChic',
});

expectEqual(
  chicModernResult.personalColor.label,
  '겨울쿨 딥',
  'chic modern personal color label',
);
expectEqual(
  chicModernResult.faceImage.label,
  '시크하고 모던한 이미지',
  'chic modern face image label',
);
expectEqual(
  chicModernResult.faceImage.primaryType,
  'chic',
  'chic modern primary image type',
);
expectEqual(
  chicModernResult.hairRecommendation.label,
  '슬릭 스트레이트 롱',
  'chic modern hair recommendation label',
);
expectEqual(
  chicModernResult.styleRecommendation.label,
  '어반 포인트 실루엣',
  'chic modern style recommendation label',
);
