import {useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, Modal, PanResponder, ScrollView, StyleSheet, View as NativeView} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Check} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';

import {colors, liquidGlass, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {
  LOCAL_BEAUTY_MAX_SELECTED_OPTIONS,
  LOCAL_BEAUTY_UNKNOWN_OPTION_ID,
  localBeautySurveyQuestions,
  normalizeLocalBeautySurveyAnswerOptionIds,
  type LocalBeautySurveyAnswers,
  type LocalBeautySurveyOption,
  type LocalBeautySurveyQuestion,
  type LocalBeautySurveyQuestionId,
} from '../services/localBeautySurveyScoring';
import {
  getLocalBeautySurveyDraft,
  getLocalBeautySurveyResultById,
  saveLocalBeautySurveyDraft,
  submitLocalBeautySurvey,
} from '../services/localBeautySurveyService';

export type LocalBeautySurveyMode = 'editAll' | 'new' | 'resume' | 'unknownOnly';

type LocalBeautySurveyScreenProps = {
  mode?: LocalBeautySurveyMode;
  onBack?: () => void;
  onComplete: (resultId: string) => void;
  onOpenTocActionChange?: (action?: () => void) => void;
  sourceResultId?: string;
};

type DraftAnswers = Partial<LocalBeautySurveyAnswers>;
type LocalBeautySurveyAnswerStatus = 'answered' | 'unknown' | 'unanswered';
type LocalBeautySurveyStage = {
  body: string;
  endIndex: number;
  id: string;
  index: number;
  label: string;
  startIndex: number;
  title: string;
};
type LocalBeautySurveyStageDefinition = {
  body: string;
  id: string;
  label: string;
  matches: (question: LocalBeautySurveyQuestion) => boolean;
  title: string;
};

type LocalBeautySurveyLayoutIntent = {
  additionalAnswerReportUpdate: 'resubmitAfterCompletedStage';
  coreStageReportAvailability: 'basicReportAfterRequiredStage';
  headerAction: 'surveyToc';
  headerLogoAlignment: 'absoluteCenter';
  modeLabelVisibility: 'hidden';
  navigationGesture: 'horizontalSwipe';
  navigationActionPlacement: 'floatingBottom';
  optionButtonMinHeight: number;
  optionDensity: 'compact';
  optionIndicatorStyle: 'checkboxSquare';
  partialReportSubmission: 'missingAnswersAsUnknown';
  questionTitleFontSize: 18;
  progressAnsweredMetaPlacement: 'hidden';
  progressContainerBackground: 'transparent';
  progressContentGap: number;
  progressFillTone: 'auraLogo';
  progressNumberPlacement: 'right';
  progressQuestionGap: 'tight';
  progressSpacerHeight: number;
  progressStageMetaPlacement: 'left';
  progressSummaryPlacement: 'floatingTop';
  saveDraftPlacement: 'floatingBottomLeft';
  stageBreakBehavior: 'completionInterstitial';
  unknownGuideCopyStrategy: 'questionSpecificUnique';
  unknownGuidePlacement: 'questionHelperArea';
  unknownOptionDescriptionVisibility: 'hidden';
  visualMaterial: 'liquidGlass';
};

const SURVEY_PROGRESS_CONTENT_GAP = 0;
const SURVEY_FLOATING_ACTION_HEIGHT = 88;
const SURVEY_FLOATING_PROGRESS_TOP = spacing.sm;
const SURVEY_FLOATING_PROGRESS_VISUAL_HEIGHT =
  typography.lineHeight.sm + spacing.sm + spacing.xs;
const SURVEY_FLOATING_PROGRESS_AFTER_GAP = spacing.xs;
const SURVEY_FLOATING_PROGRESS_SPACER_HEIGHT =
  SURVEY_FLOATING_PROGRESS_TOP +
  SURVEY_FLOATING_PROGRESS_VISUAL_HEIGHT +
  SURVEY_FLOATING_PROGRESS_AFTER_GAP;
const SURVEY_OPTION_BUTTON_MIN_HEIGHT = spacing.xxl * 3;

const localBeautySurveyLayoutIntent = {
  additionalAnswerReportUpdate: 'resubmitAfterCompletedStage',
  coreStageReportAvailability: 'basicReportAfterRequiredStage',
  headerAction: 'surveyToc',
  headerLogoAlignment: 'absoluteCenter',
  modeLabelVisibility: 'hidden',
  navigationGesture: 'horizontalSwipe',
  navigationActionPlacement: 'floatingBottom',
  optionButtonMinHeight: SURVEY_OPTION_BUTTON_MIN_HEIGHT,
  optionDensity: 'compact',
  optionIndicatorStyle: 'checkboxSquare',
  partialReportSubmission: 'missingAnswersAsUnknown',
  questionTitleFontSize: 18,
  progressAnsweredMetaPlacement: 'hidden',
  progressContainerBackground: 'transparent',
  progressContentGap: SURVEY_PROGRESS_CONTENT_GAP,
  progressFillTone: 'auraLogo',
  progressNumberPlacement: 'right',
  progressQuestionGap: 'tight',
  progressSpacerHeight: SURVEY_FLOATING_PROGRESS_SPACER_HEIGHT,
  progressStageMetaPlacement: 'left',
  progressSummaryPlacement: 'floatingTop',
  saveDraftPlacement: 'floatingBottomLeft',
  stageBreakBehavior: 'completionInterstitial',
  unknownGuideCopyStrategy: 'questionSpecificUnique',
  unknownGuidePlacement: 'questionHelperArea',
  unknownOptionDescriptionVisibility: 'hidden',
  visualMaterial: 'liquidGlass',
} as const satisfies LocalBeautySurveyLayoutIntent;

const localBeautySurveyStageDefinitions: readonly LocalBeautySurveyStageDefinition[] = [
  {
    body: '잘 대답했어요. 기본 단서가 모여서 전체 스타일 진단의 중심축을 잡을 수 있게 되었어요.',
    id: 'core',
    label: '필수 핵심 진단',
    matches: question => !question.id.startsWith('detail'),
    title: '핵심 방향이 잡혔어요',
  },
  {
    body: '톤, 밝기, 대비 반응이 쌓여서 퍼스널 컬러 결과를 더 세밀하게 볼 수 있게 되었어요.',
    id: 'color',
    label: '퍼스널 컬러 세부',
    matches: question =>
      hasLocalBeautyQuestionIdPrefix(question, [
        'detailNaturalLightSkin',
        'detailIndoorSkin',
        'detailWhiteBalance',
        'detailBlackBalance',
        'detailPastelReaction',
        'detailEarthReaction',
        'detailVividReaction',
        'detailMonochromeReaction',
      ]),
    title: '컬러 방향이 선명해졌어요',
  },
  {
    body: '립, 치크, 베이스 질감 답변이 더해져서 메이크업 추천 팁을 더 구체적으로 만들 수 있어요.',
    id: 'makeup',
    label: '메이크업 세부',
    matches: question =>
      hasLocalBeautyQuestionIdPrefix(question, [
        'detailBlushArea',
        'detailLipDepth',
        'detailEyeShadowDepth',
        'detailBaseLongevity',
        'detailMakeupBoundary',
        'detailHighlightReaction',
      ]),
    title: '메이크업 결과가 깊어졌어요',
  },
  {
    body: '길이, 앞머리, 옆머리, 윤기와 컬러 밝기 단서가 모여서 헤어 추천이 더 촘촘해졌어요.',
    id: 'hair',
    label: '헤어 세부',
    matches: question =>
      hasLocalBeautyQuestionIdPrefix(question, [
        'detailHairFaceFrame',
        'detailHairEnds',
        'detailHairBangWeight',
        'detailHairShine',
        'detailHairColorBrightness',
      ]),
    title: '헤어 추천이 촘촘해졌어요',
  },
  {
    body: '네크라인, 어깨선, 길이와 허리선 답변이 쌓여서 체형과 핏을 보는 기준이 더 정리됐어요.',
    id: 'fit',
    label: '체형·핏 세부',
    matches: question =>
      hasLocalBeautyQuestionIdPrefix(question, [
        'detailTopNeckline',
        'detailShoulderLine',
        'detailOuterLength',
        'detailPantsRise',
        'detailSkirtShape',
      ]),
    title: '핏과 비율 단서가 쌓였어요',
  },
  {
    body: '소재, 패턴, 레이어링과 액세서리 답변이 더해져서 스타일링 방향을 더 잘 나눠볼 수 있어요.',
    id: 'styling',
    label: '패션·스타일링 세부',
    matches: question =>
      hasLocalBeautyQuestionIdPrefix(question, [
        'detailLayerContrast',
        'detailTextureWeight',
        'detailPatternDistance',
        'detailAccessoryEarring',
        'detailAccessoryGlasses',
      ]),
    title: '스타일링 단서가 정리됐어요',
  },
  {
    body: '데일리, 업무, 약속, 촬영 상황의 이미지 답변이 쌓여서 분위기 키워드를 더 또렷하게 정리할 수 있어요.',
    id: 'image',
    label: '이미지 무드 세부',
    matches: question =>
      hasLocalBeautyQuestionIdPrefix(question, [
        'detailDailyMood',
        'detailWorkMood',
        'detailDateMood',
        'detailPhotoMood',
      ]),
    title: '이미지 무드가 선명해졌어요',
  },
] as const;

export function getLocalBeautySurveyLayoutIntent() {
  return localBeautySurveyLayoutIntent;
}

export function formatLocalBeautyUnknownGuideText(guide: string) {
  return guide.replace(/확인법:\s*/g, '');
}

export function getLocalBeautySurveyAnswerStatus(
  optionIds: readonly LocalBeautySurveyOption['id'][] | undefined,
): LocalBeautySurveyAnswerStatus {
  if (!optionIds || optionIds.length === 0) {
    return 'unanswered';
  }

  return optionIds.includes(LOCAL_BEAUTY_UNKNOWN_OPTION_ID) ? 'unknown' : 'answered';
}

export function getNextLocalBeautySurveySelectedOptionIds(
  selectedOptionIds: readonly LocalBeautySurveyOption['id'][] | undefined,
  optionId: LocalBeautySurveyOption['id'],
): readonly LocalBeautySurveyOption['id'][] {
  const normalizedOptionIds = normalizeLocalBeautySurveyAnswerOptionIds(
    selectedOptionIds,
  );

  if (optionId === LOCAL_BEAUTY_UNKNOWN_OPTION_ID) {
    return normalizedOptionIds.includes(LOCAL_BEAUTY_UNKNOWN_OPTION_ID)
      ? []
      : [LOCAL_BEAUTY_UNKNOWN_OPTION_ID];
  }

  const selectedKnownOptionIds = normalizedOptionIds.filter(
    selectedOptionId => selectedOptionId !== LOCAL_BEAUTY_UNKNOWN_OPTION_ID,
  );

  if (selectedKnownOptionIds.includes(optionId)) {
    return selectedKnownOptionIds.filter(
      selectedOptionId => selectedOptionId !== optionId,
    );
  }

  if (selectedKnownOptionIds.length >= LOCAL_BEAUTY_MAX_SELECTED_OPTIONS) {
    return selectedKnownOptionIds;
  }

  return [...selectedKnownOptionIds, optionId];
}

export function getLocalBeautySurveyStagePlan(
  questions: readonly LocalBeautySurveyQuestion[],
): readonly LocalBeautySurveyStage[] {
  const stageRanges = new Map<
    string,
    {definition: LocalBeautySurveyStageDefinition; endIndex: number; startIndex: number}
  >();

  questions.forEach((question, questionIndex) => {
    const definition = getLocalBeautySurveyStageDefinition(question);
    const previousRange = stageRanges.get(definition.id);

    stageRanges.set(definition.id, {
      definition,
      endIndex: questionIndex,
      startIndex: previousRange?.startIndex ?? questionIndex,
    });
  });

  return localBeautySurveyStageDefinitions.flatMap((definition) => {
    const range = stageRanges.get(definition.id);

    if (!range) {
      return [];
    }

    const index = Array.from(stageRanges.keys()).findIndex(id => id === definition.id);

    return [
      {
        body: definition.body,
        endIndex: range.endIndex,
        id: `local-beauty-stage-${definition.id}`,
        index,
        label: definition.label,
        startIndex: range.startIndex,
        title: `${index + 1}단계 완료 · ${definition.title}`,
      },
    ];
  });
}

export function formatLocalBeautySurveyProgressStageLabel(
  stage: LocalBeautySurveyStage,
) {
  return `${stage.index + 1}단계 ${stage.label}`;
}

function getLocalBeautySurveyStageDefinition(question: LocalBeautySurveyQuestion) {
  return (
    localBeautySurveyStageDefinitions.find(definition =>
      definition.matches(question),
    ) ?? localBeautySurveyStageDefinitions[0]
  );
}

function hasLocalBeautyQuestionIdPrefix(
  question: LocalBeautySurveyQuestion,
  prefixes: readonly string[],
) {
  return prefixes.some(prefix => question.id.startsWith(prefix));
}

export function LocalBeautySurveyScreen({
  mode = 'new',
  onBack,
  onComplete,
  onOpenTocActionChange,
  sourceResultId,
}: LocalBeautySurveyScreenProps) {
  const insets = useSafeAreaInsets();
  const [answers, setAnswers] = useState<DraftAnswers>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [completedStage, setCompletedStage] = useState<LocalBeautySurveyStage | null>(null);
  const [isTocVisible, setIsTocVisible] = useState(false);
  const [surveyQuestions, setSurveyQuestions] = useState<readonly LocalBeautySurveyQuestion[]>(
    localBeautySurveyQuestions,
  );
  const [isLoadingSurvey, setIsLoadingSurvey] = useState(mode !== 'new');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentQuestion = surveyQuestions[currentQuestionIndex];
  const selectedOptionIds = currentQuestion ? answers[currentQuestion.id] : undefined;
  const progressLabel = `${currentQuestionIndex + 1}/${surveyQuestions.length}`;
  const progressPercent =
    ((currentQuestionIndex + 1) / surveyQuestions.length) * 100;
  const floatingActionBottomInset = Math.max(insets.bottom, spacing.md);
  const floatingActionContentBottomPadding =
    SURVEY_FLOATING_ACTION_HEIGHT + floatingActionBottomInset;
  const canGoNext = Boolean(selectedOptionIds?.length) && !isSubmitting;
  const isFinalQuestion = currentQuestionIndex === surveyQuestions.length - 1;
  const stagePlan = useMemo(
    () => getLocalBeautySurveyStagePlan(surveyQuestions),
    [surveyQuestions],
  );
  const currentStage =
    stagePlan.find(stage =>
      currentQuestionIndex >= stage.startIndex && currentQuestionIndex <= stage.endIndex,
    ) ?? stagePlan[0];

  useEffect(() => {
    let isMounted = true;

    async function hydrateSurvey() {
      setIsLoadingSurvey(true);

      if (sourceResultId) {
        const result = await getLocalBeautySurveyResultById(sourceResultId);

        if (!isMounted) {
          return;
        }

        const unknownQuestions = result
          ? localBeautySurveyQuestions.filter(question =>
              result.unknownQuestionIds.includes(question.id),
            )
          : [];
        const nextQuestions =
          mode === 'unknownOnly' && unknownQuestions.length > 0
            ? unknownQuestions
            : localBeautySurveyQuestions;

        setSurveyQuestions(nextQuestions);
        setAnswers(result ? {...result.surveyAnswers} : {});
        setCompletedStage(null);
        setCurrentQuestionIndex(0);
        setIsLoadingSurvey(false);
        return;
      }

      if (mode === 'resume') {
        const draft = await getLocalBeautySurveyDraft();

        if (!isMounted) {
          return;
        }

        setSurveyQuestions(localBeautySurveyQuestions);
        setAnswers(draft ? {...draft.answers} : {});
        setCompletedStage(null);
        setCurrentQuestionIndex(
          draft
            ? getResumeQuestionIndex(draft.currentQuestionId, draft.answers)
            : 0,
        );
        setIsLoadingSurvey(false);
        return;
      }

      setSurveyQuestions(localBeautySurveyQuestions);
      setAnswers({});
      setCompletedStage(null);
      setCurrentQuestionIndex(0);
      setIsLoadingSurvey(false);
    }

    void hydrateSurvey();

    return () => {
      isMounted = false;
    };
  }, [mode, sourceResultId]);

  const handleSelectOption = (optionId: LocalBeautySurveyOption['id']) => {
    if (!currentQuestion) {
      return;
    }

    setAnswers((prevAnswers) => {
      const nextOptionIds = getNextLocalBeautySurveySelectedOptionIds(
        prevAnswers[currentQuestion.id],
        optionId,
      );

      return {
        ...prevAnswers,
        [currentQuestion.id]: nextOptionIds,
      };
    });
  };

  const handlePrevious = useCallback(() => {
    if (completedStage) {
      setCompletedStage(null);
      return;
    }

    if (currentQuestionIndex === 0) {
      return;
    }

    setCurrentQuestionIndex(previousIndex => Math.max(0, previousIndex - 1));
  }, [completedStage, currentQuestionIndex]);

  const handleSaveDraft = useCallback(async () => {
    if (!currentQuestion) {
      return;
    }

    await saveLocalBeautySurveyDraft({
      answers,
      currentQuestionId: currentQuestion.id,
    });

    Alert.alert(
      '중간 저장 완료',
      '지금까지 고른 답변을 저장했어요. 메인 화면에서 이어서 진행할 수 있어요.',
    );
  }, [answers, currentQuestion]);

  const openSurveyToc = useCallback(() => {
    setIsTocVisible(true);
  }, []);

  useEffect(() => {
    onOpenTocActionChange?.(openSurveyToc);
    return () => {
      onOpenTocActionChange?.(undefined);
    };
  }, [onOpenTocActionChange, openSurveyToc]);

  const submitAnswers = useCallback(async () => {
    const completeAnswers = buildCompleteAnswers(answers);

    setIsSubmitting(true);

    try {
      const result = await submitLocalBeautySurvey(completeAnswers);

      onComplete(result.id);
    } finally {
      setIsSubmitting(false);
    }
  }, [answers, onComplete]);

  const handleNext = useCallback(async () => {
    if (completedStage) {
      setCompletedStage(null);

      if (completedStage.endIndex >= surveyQuestions.length - 1) {
        await submitAnswers();
        return;
      }

      setCurrentQuestionIndex(completedStage.endIndex + 1);
      return;
    }

    if (!canGoNext) {
      return;
    }

    const endingStage = stagePlan.find(stage => stage.endIndex === currentQuestionIndex);

    if (endingStage) {
      setCompletedStage(endingStage);
      return;
    }

    if (!isFinalQuestion) {
      setCurrentQuestionIndex(previousIndex =>
        Math.min(surveyQuestions.length - 1, previousIndex + 1),
      );
      return;
    }

    await submitAnswers();
  }, [
    canGoNext,
    completedStage,
    currentQuestionIndex,
    isFinalQuestion,
    stagePlan,
    submitAnswers,
    surveyQuestions.length,
  ]);

  const handleViewCompletedStageReport = useCallback(async () => {
    if (!completedStage || isSubmitting) {
      return;
    }

    await submitAnswers();
  }, [completedStage, isSubmitting, submitAnswers]);

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 36 && Math.abs(gestureState.dy) < 28,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -48) {
            void handleNext();
            return;
          }

          if (gestureState.dx > 48) {
            handlePrevious();
          }
        },
      }),
    [handleNext, handlePrevious],
  );

  const handleSelectQuestionFromToc = useCallback((nextQuestionIndex: number) => {
    setCompletedStage(null);
    setCurrentQuestionIndex(nextQuestionIndex);
    setIsTocVisible(false);
  }, []);

  if (isLoadingSurvey) {
    return (
      <AppScreen
        backgroundColor={colors.background}
        bottomPadding="safeArea"
        contentGap={spacing.xl}
        topPadding="belowShellHeader">
        <YStack style={styles.loadingArea}>
          <Text style={styles.loadingTitle}>설문을 불러오는 중이에요</Text>
          <Text style={styles.loadingDescription}>
            저장된 답변과 질문 흐름을 확인하고 있어요.
          </Text>
        </YStack>
      </AppScreen>
    );
  }

  if (!currentQuestion) {
    return null;
  }

  if (completedStage) {
    const isFinalCompletedStage =
      completedStage.endIndex >= surveyQuestions.length - 1;

    return (
      <NativeView style={styles.screenRoot}>
        <AppScreen
          backgroundColor={colors.background}
          bottomPadding={floatingActionContentBottomPadding}
          contentGap={spacing.xl}
          topPadding="belowShellHeader">
          <SurveyTocModal
            answers={answers}
            onClose={() => setIsTocVisible(false)}
            onSelectQuestion={handleSelectQuestionFromToc}
            questions={surveyQuestions}
            stagePlan={stagePlan}
            visible={isTocVisible}
          />
          <YStack style={styles.stageCompletion}>
            <Text style={styles.stageEyebrow}>
              {completedStage.label} · {completedStage.startIndex + 1}-{completedStage.endIndex + 1}번 답변 완료
            </Text>
            <Text style={styles.stageTitle}>{completedStage.title}</Text>
            <Text style={styles.stageBody}>{completedStage.body}</Text>
          </YStack>
        </AppScreen>
        <SurveyFloatingProgress
          progressLabel={progressLabel}
          progressPercent={progressPercent}
          stage={completedStage}
        />
        <SurveyFloatingActions
          bottomInset={floatingActionBottomInset}
          isPrimaryDisabled={isSubmitting}
          isSecondaryDisabled={isSubmitting}
          onPrimary={() => void handleNext()}
          onSecondary={
            isFinalCompletedStage
              ? undefined
              : () => void handleViewCompletedStageReport()
          }
          primaryLabel={isFinalCompletedStage ? '결과 보기' : '더 답변하기'}
          secondaryLabel={
            isFinalCompletedStage
              ? undefined
              : getCompletedStageReportActionLabel(completedStage)
          }
        />
      </NativeView>
    );
  }

  return (
    <NativeView style={styles.screenRoot}>
      <AppScreen
        backgroundColor={colors.background}
        bottomPadding={floatingActionContentBottomPadding}
        contentGap={SURVEY_PROGRESS_CONTENT_GAP}
        topPadding="belowShellHeader">
        <SurveyTocModal
          answers={answers}
          onClose={() => setIsTocVisible(false)}
          onSelectQuestion={handleSelectQuestionFromToc}
          questions={surveyQuestions}
          stagePlan={stagePlan}
          visible={isTocVisible}
        />
        <NativeView style={styles.floatingProgressSpacer} />

        <NativeView style={styles.swipeArea} {...swipeResponder.panHandlers}>
          <YStack style={styles.questionArea}>
            <Text style={styles.eyebrow}>{currentQuestion.eyebrow}</Text>
            <Text style={styles.title}>{currentQuestion.title}</Text>
            <Text style={styles.helper}>{currentQuestion.helper}</Text>
            <YStack style={styles.unknownGuidePanel}>
              <Text style={styles.unknownGuideText}>
                {formatLocalBeautyUnknownGuideText(currentQuestion.unknownGuide)}
              </Text>
            </YStack>
          </YStack>

          <YStack style={styles.optionList}>
            {currentQuestion.options.map(option => {
              const isSelected = selectedOptionIds?.includes(option.id) ?? false;
              const isSelectionLimitReached =
                !isSelected &&
                option.id !== LOCAL_BEAUTY_UNKNOWN_OPTION_ID &&
                (selectedOptionIds?.filter(
                  selectedOptionId =>
                    selectedOptionId !== LOCAL_BEAUTY_UNKNOWN_OPTION_ID,
                ).length ?? 0) >= LOCAL_BEAUTY_MAX_SELECTED_OPTIONS;

              return (
                <Button
                  accessibilityLabel={option.label}
                  accessibilityRole="checkbox"
                  accessibilityState={{checked: isSelected, disabled: isSelectionLimitReached}}
                  disabled={isSelectionLimitReached}
                  disabledStyle={{opacity: 0.42}}
                  key={option.id}
                  onPress={() => handleSelectOption(option.id)}
                  pressStyle={{opacity: 0.82}}
                  style={[
                    styles.optionButton,
                    isSelected ? styles.selectedOptionButton : undefined,
                  ]}
                  unstyled>
                  <XStack style={styles.optionContent}>
                    <View
                      style={[
                        styles.optionIndicator,
                        isSelected ? styles.selectedOptionIndicator : undefined,
                      ]}>
                      {isSelected ? (
                        <Check color={colors.white} size={14} strokeWidth={3} />
                      ) : null}
                    </View>
                    <YStack style={styles.optionTextGroup}>
                      <Text style={styles.optionLabel}>{option.label}</Text>
                      {option.description ? (
                        <Text style={styles.optionDescription}>
                          {option.description}
                        </Text>
                      ) : null}
                    </YStack>
                  </XStack>
                </Button>
              );
            })}
          </YStack>
        </NativeView>
      </AppScreen>
      <SurveyFloatingActions
        bottomInset={floatingActionBottomInset}
        isPrimaryDisabled={!canGoNext}
        onPrimary={() => void handleNext()}
        onSecondary={handleSaveDraft}
        primaryLabel={isFinalQuestion ? '결과 보기' : '다음'}
        secondaryLabel="중간 저장"
      />
      <SurveyFloatingProgress
        progressLabel={progressLabel}
        progressPercent={progressPercent}
        stage={currentStage}
      />
    </NativeView>
  );
}

function SurveyFloatingProgress({
  progressLabel,
  progressPercent,
  stage,
}: {
  progressLabel: string;
  progressPercent: number;
  stage: LocalBeautySurveyStage;
}) {
  return (
    <NativeView pointerEvents="none" style={styles.floatingProgressShell}>
      <XStack style={styles.progressHeader}>
        <Text style={styles.progressStageText}>
          {formatLocalBeautySurveyProgressStageLabel(stage)}
        </Text>
        <Text style={styles.progressLabel}>{progressLabel}</Text>
      </XStack>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, {width: `${progressPercent}%`}]} />
      </View>
    </NativeView>
  );
}

function SurveyFloatingActions({
  bottomInset,
  isPrimaryDisabled,
  isSecondaryDisabled = false,
  onPrimary,
  onSecondary,
  primaryLabel,
  secondaryLabel,
}: {
  bottomInset: number;
  isPrimaryDisabled: boolean;
  isSecondaryDisabled?: boolean;
  onPrimary: () => void;
  onSecondary?: () => void;
  primaryLabel: string;
  secondaryLabel?: string;
}) {
  return (
    <NativeView
      pointerEvents="box-none"
      style={[styles.floatingActionShell, {paddingBottom: bottomInset}]}>
      <XStack style={styles.floatingNavigationActions}>
        {secondaryLabel && onSecondary ? (
          <Button
            accessibilityLabel={secondaryLabel}
            accessibilityRole="button"
            disabled={isSecondaryDisabled}
            disabledStyle={{opacity: 0.36}}
            onPress={onSecondary}
            pressStyle={{opacity: 0.78}}
            style={styles.secondaryButton}
            unstyled>
            <Text style={styles.secondaryButtonText}>{secondaryLabel}</Text>
          </Button>
        ) : null}
        <Button
          accessibilityLabel={primaryLabel}
          accessibilityRole="button"
          disabled={isPrimaryDisabled}
          disabledStyle={{opacity: 0.36}}
          onPress={onPrimary}
          pressStyle={{opacity: 0.78}}
          style={styles.primaryButton}
          unstyled>
          <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
        </Button>
      </XStack>
    </NativeView>
  );
}

function getCompletedStageReportActionLabel(stage: LocalBeautySurveyStage) {
  return stage.index === 0 ? '기본 레포트 보기' : '레포트 업데이트 보기';
}

function buildCompleteAnswers(
  answers: DraftAnswers,
): LocalBeautySurveyAnswers {
  return localBeautySurveyQuestions.reduce<LocalBeautySurveyAnswers>(
    (nextAnswers, question) => {
      const optionIds = normalizeLocalBeautySurveyAnswerOptionIds(
        answers[question.id],
        question.options.map(option => option.id),
      );

      nextAnswers[question.id] =
        optionIds.length > 0 ? optionIds : [LOCAL_BEAUTY_UNKNOWN_OPTION_ID];
      return nextAnswers;
    },
    {},
  );
}

function SurveyTocModal({
  answers,
  onClose,
  onSelectQuestion,
  questions,
  stagePlan,
  visible,
}: {
  answers: DraftAnswers;
  onClose: () => void;
  onSelectQuestion: (questionIndex: number) => void;
  questions: readonly LocalBeautySurveyQuestion[];
  stagePlan: readonly LocalBeautySurveyStage[];
  visible: boolean;
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}>
      <NativeView style={styles.tocBackdrop}>
        <YStack style={styles.tocSheet}>
          <XStack style={styles.tocHeader}>
            <YStack style={styles.tocHeaderCopy}>
              <Text style={styles.tocTitle}>설문 목차</Text>
              <Text style={styles.tocDescription}>
                답변 상태를 보고 원하는 질문으로 바로 이동할 수 있어요.
              </Text>
            </YStack>
            <Button
              accessibilityLabel="설문 목차 닫기"
              accessibilityRole="button"
              onPress={onClose}
              pressStyle={{opacity: 0.78}}
              style={styles.tocCloseButton}
              unstyled>
              <Text style={styles.tocCloseText}>닫기</Text>
            </Button>
          </XStack>
          <ScrollView
            contentContainerStyle={styles.tocScrollContent}
            showsVerticalScrollIndicator={false}>
            {stagePlan.map(stage => (
              <YStack key={stage.id} style={styles.tocStage}>
                <Text style={styles.tocStageTitle}>
                  {stage.index + 1}단계 · {stage.label} · {stage.startIndex + 1}-{stage.endIndex + 1}번
                </Text>
                {questions
                  .slice(stage.startIndex, stage.endIndex + 1)
                  .map((question, offset) => {
                    const questionIndex = stage.startIndex + offset;
                    const status = getLocalBeautySurveyAnswerStatus(answers[question.id]);

                    return (
                      <Button
                        accessibilityLabel={`${questionIndex + 1}번 질문으로 이동`}
                        accessibilityRole="button"
                        key={question.id}
                        onPress={() => onSelectQuestion(questionIndex)}
                        pressStyle={{opacity: 0.78}}
                        style={styles.tocQuestionButton}
                        unstyled>
                        <XStack style={styles.tocQuestionRow}>
                          <Text style={styles.tocQuestionNumber}>{questionIndex + 1}</Text>
                          <Text numberOfLines={2} style={styles.tocQuestionTitle}>
                            {question.title}
                          </Text>
                          <Text
                            style={[
                              styles.tocStatusBadge,
                              status === 'answered' ? styles.tocStatusAnswered : undefined,
                              status === 'unknown' ? styles.tocStatusUnknown : undefined,
                              status === 'unanswered' ? styles.tocStatusUnanswered : undefined,
                            ]}>
                            {getLocalBeautySurveyAnswerStatusLabel(status)}
                          </Text>
                        </XStack>
                      </Button>
                    );
                  })}
              </YStack>
            ))}
          </ScrollView>
        </YStack>
      </NativeView>
    </Modal>
  );
}

function getLocalBeautySurveyAnswerStatusLabel(
  status: LocalBeautySurveyAnswerStatus,
) {
  if (status === 'answered') {
    return '답변 완료';
  }

  if (status === 'unknown') {
    return '모르겠음';
  }

  return '미응답';
}

function getResumeQuestionIndex(
  currentQuestionId: LocalBeautySurveyQuestionId,
  answers: Partial<LocalBeautySurveyAnswers>,
) {
  const currentIndex = localBeautySurveyQuestions.findIndex(
    question => question.id === currentQuestionId,
  );

  if (currentIndex >= 0) {
    return currentIndex;
  }

  const firstUnansweredIndex = localBeautySurveyQuestions.findIndex(
    question => getLocalBeautySurveyAnswerStatus(answers[question.id]) === 'unanswered',
  );

  return firstUnansweredIndex >= 0 ? firstUnansweredIndex : 0;
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  helper: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  loadingArea: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  loadingDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  loadingTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
  },
  floatingActionShell: {
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.sm,
    position: 'absolute',
    right: 0,
    zIndex: 10,
  },
  floatingNavigationActions: {
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  floatingProgressShell: {
    gap: spacing.sm,
    left: 0,
    paddingHorizontal: spacing.screenX,
    position: 'absolute',
    right: 0,
    top: SURVEY_FLOATING_PROGRESS_TOP,
    zIndex: 9,
  },
  floatingProgressSpacer: {
    height: SURVEY_FLOATING_PROGRESS_SPACER_HEIGHT,
  },
  optionButton: {
    ...liquidGlass.control,
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: SURVEY_OPTION_BUTTON_MIN_HEIGHT,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    width: '100%',
  },
  optionContent: {
    alignItems: 'center',
    gap: spacing.md,
    minHeight: typography.lineHeight.md + typography.lineHeight.sm + spacing.xs,
  },
  optionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  optionIndicator: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    height: spacing.xxl,
    justifyContent: 'center',
    width: spacing.xxl,
  },
  optionLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  optionList: {
    gap: spacing.xs,
  },
  optionTextGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  primaryButton: {
    alignItems: 'center',
    ...liquidGlass.primaryControl,
    borderRadius: radius.pill,
    flex: 1,
    height: 52,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  progressFill: {
    backgroundColor: colors.brandMuted,
    borderRadius: radius.pill,
    height: '100%',
  },
  progressHeader: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  progressLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'right',
  },
  progressStageText: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  progressTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: spacing.xs,
    overflow: 'hidden',
    width: '100%',
  },
  questionArea: {
    gap: spacing.sm,
  },
  secondaryButton: {
    alignItems: 'center',
    ...liquidGlass.control,
    borderRadius: radius.pill,
    flex: 0.68,
    height: 52,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  selectedOptionButton: {
    borderColor: colors.black,
    borderWidth: 1.5,
  },
  selectedOptionIndicator: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  screenRoot: {
    backgroundColor: colors.background,
    flex: 1,
  },
  stageBody: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  stageCompletion: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  stageEyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  stageTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
  swipeArea: {
    gap: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  tocBackdrop: {
    backgroundColor: 'rgba(17, 17, 17, 0.24)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  tocCloseButton: {
    alignItems: 'center',
    ...liquidGlass.control,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  tocCloseText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  tocDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  tocHeader: {
    alignItems: 'flex-start',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  tocHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  tocQuestionButton: {
    ...liquidGlass.control,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: '100%',
  },
  tocQuestionNumber: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    width: 28,
  },
  tocQuestionRow: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  tocQuestionTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  tocScrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  tocSheet: {
    ...liquidGlass.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.lg,
    maxHeight: '82%',
    padding: spacing.xl,
  },
  tocStage: {
    gap: spacing.xs,
  },
  tocStageTitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  tocStatusAnswered: {
    backgroundColor: 'rgba(17, 17, 17, 0.88)',
    color: colors.white,
  },
  tocStatusBadge: {
    borderRadius: radius.pill,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tocStatusUnanswered: {
    backgroundColor: colors.surfaceMuted,
  },
  tocStatusUnknown: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderColor: colors.borderStrong,
    borderWidth: 1,
  },
  tocTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  unknownGuidePanel: {
    ...liquidGlass.panel,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  unknownGuideText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
});
