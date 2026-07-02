import {
  clearLocalBeautySurveyDraft,
  getRecentLocalBeautySurveyResults,
  getLocalBeautySurveyResultById,
  getLocalBeautySurveyDraft,
  saveLocalBeautySurveyDraft,
  submitLocalBeautySurvey,
} from './localBeautySurveyService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

void submitLocalBeautySurvey({
  accessoryScale: 'mediumClean',
  bestColors: 'powderCool',
  browLine: 'cleanArch',
  colorSaturation: 'lightClear',
  contrast: 'softLight',
  eyeContrast: 'clearBrown',
  fabricTexture: 'sheerGlossy',
  hairLength: 'mediumLayer',
  hairParting: 'curtainBangs',
  hairStyling: 'cCurveVolume',
  hairTone: 'ashBrown',
  hairVolume: 'crownSoftVolume',
  impression: 'softNatural',
  imageDetail: 'softBlur',
  imageKeyword: 'calmGentleKeyword',
  imageLine: 'balancedClean',
  imagePace: 'relaxedNatural',
  jewelryTone: 'silver',
  layeringStyle: 'oneToneSetLayer',
  lipBoundary: 'glossTint',
  makeupTone: 'rosePink',
  occasionStyle: 'dailyCasualOccasion',
  overallPreference: 'coolClean',
  patternScale: 'plainTexturePattern',
  patternMood: 'delicateDetail',
  skinReaction: 'pinkCool',
  sunReaction: 'redEasily',
  bodyFitBalance: 'straightRelaxedBalance',
  bottomFit: 'wideSlacksBottom',
  fashionMood: 'minimalCleanMood',
  fashionSilhouette: 'naturalLooseSilhouette',
  topFit: 'relaxedShirtTop',
  undertoneClue: 'coolVein',
  waistStyling: 'untuckedLayerLine',
}).then(async (result) => {
  const savedResult = await getLocalBeautySurveyResultById(result.id);
  const recentResults = await getRecentLocalBeautySurveyResults();

  expectEqual(savedResult?.id, result.id, 'saved local beauty survey result id');
  expectEqual(recentResults[0]?.id, result.id, 'recent local beauty survey result id');
  expectEqual(result.personalColor.label, '여름쿨 라이트', 'service result label');
  expectEqual(
    result.surveyAnswers.skinReaction?.[0],
    'pinkCool',
    'service result stores survey answers',
  );
}).then(async () => {
  await saveLocalBeautySurveyDraft({
    answers: {
      skinReaction: 'pinkCool',
      jewelryTone: 'silver',
    },
    currentQuestionId: 'jewelryTone',
  });

  const draft = await getLocalBeautySurveyDraft();

  expectEqual(draft?.answers.skinReaction?.[0], 'pinkCool', 'draft stores selected answer');
  expectEqual(draft?.currentQuestionId, 'jewelryTone', 'draft stores current question');

  await clearLocalBeautySurveyDraft();

  const clearedDraft = await getLocalBeautySurveyDraft();

  expectEqual(clearedDraft, null, 'draft clears after request');
});
