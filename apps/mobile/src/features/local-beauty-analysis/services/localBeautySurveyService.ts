import * as SecureStore from 'expo-secure-store';

import {
  analyzeLocalBeautySurvey,
  LOCAL_BEAUTY_UNKNOWN_OPTION_ID,
  localBeautySurveyQuestions,
  normalizeLocalBeautySurveyAnswerOptionIds,
  type LocalBeautySurveyAnswerInput,
  type LocalBeautySurveyAnswers,
  type LocalBeautySurveyResult,
} from './localBeautySurveyScoring';

const LOCAL_BEAUTY_RECENT_RESULTS_KEY = 'aura.localBeauty.recentResults.v1';
const LOCAL_BEAUTY_SURVEY_DRAFT_KEY = 'aura.localBeauty.surveyDraft.v1';
const LOCAL_BEAUTY_RECENT_RESULT_LIMIT = 5;

const surveyResultsById = new Map<string, LocalBeautySurveyResult>();
let latestResultId: string | null = null;
let recentResultIds: string[] = [];
let hasLoadedStoredResults = false;

export type LocalBeautySurveyDraft = {
  answers: Partial<LocalBeautySurveyAnswers>;
  currentQuestionId: string;
  updatedAt: string;
};

type SaveLocalBeautySurveyDraftInput = {
  answers: Partial<Record<string, LocalBeautySurveyAnswerInput>>;
  currentQuestionId: string;
};

export async function submitLocalBeautySurvey(
  answers: Partial<Record<string, LocalBeautySurveyAnswerInput>>,
): Promise<LocalBeautySurveyResult> {
  await loadStoredLocalBeautySurveyResults();

  const result = analyzeLocalBeautySurvey(answers);

  saveLocalBeautySurveyResultInMemory(result);
  await persistRecentLocalBeautySurveyResults();
  await clearLocalBeautySurveyDraft();

  return Promise.resolve(result);
}

export async function saveLocalBeautySurveyDraft({
  answers,
  currentQuestionId,
}: SaveLocalBeautySurveyDraftInput): Promise<LocalBeautySurveyDraft> {
  const draft: LocalBeautySurveyDraft = {
    answers: normalizeDraftAnswers(answers),
    currentQuestionId,
    updatedAt: new Date().toISOString(),
  };

  try {
    await SecureStore.setItemAsync(
      LOCAL_BEAUTY_SURVEY_DRAFT_KEY,
      JSON.stringify(draft),
      {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      },
    );
  } catch {
    // Draft save is a convenience; keep the active survey usable.
  }

  return draft;
}

export async function getLocalBeautySurveyDraft(): Promise<LocalBeautySurveyDraft | null> {
  try {
    const storedValue = await SecureStore.getItemAsync(LOCAL_BEAUTY_SURVEY_DRAFT_KEY);
    const parsedValue: unknown = storedValue ? JSON.parse(storedValue) : null;

    return isLocalBeautySurveyDraft(parsedValue)
      ? {
          ...parsedValue,
          answers: normalizeDraftAnswers(
            parsedValue.answers as Partial<Record<string, unknown>>,
          ),
        }
      : null;
  } catch {
    return null;
  }
}

export async function clearLocalBeautySurveyDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(LOCAL_BEAUTY_SURVEY_DRAFT_KEY);
  } catch {
    // Clearing a stale draft should never block the result flow.
  }
}

export async function getLocalBeautySurveyResultById(
  resultId: string,
): Promise<LocalBeautySurveyResult | null> {
  await loadStoredLocalBeautySurveyResults();

  return Promise.resolve(surveyResultsById.get(resultId) ?? null);
}

export async function getLatestLocalBeautySurveyResult() {
  await loadStoredLocalBeautySurveyResults();

  if (!latestResultId) {
    return Promise.resolve(null);
  }

  return getLocalBeautySurveyResultById(latestResultId);
}

export async function getRecentLocalBeautySurveyResults(
  limit = LOCAL_BEAUTY_RECENT_RESULT_LIMIT,
): Promise<readonly LocalBeautySurveyResult[]> {
  await loadStoredLocalBeautySurveyResults();

  return recentResultIds
    .slice(0, Math.max(0, limit))
    .map(resultId => surveyResultsById.get(resultId))
    .filter(isLocalBeautySurveyResult);
}

function saveLocalBeautySurveyResultInMemory(result: LocalBeautySurveyResult) {
  surveyResultsById.set(result.id, result);
  recentResultIds = [
    result.id,
    ...recentResultIds.filter(resultId => resultId !== result.id),
  ].slice(0, LOCAL_BEAUTY_RECENT_RESULT_LIMIT);
  latestResultId = recentResultIds[0] ?? null;
}

async function loadStoredLocalBeautySurveyResults() {
  if (hasLoadedStoredResults) {
    return;
  }

  hasLoadedStoredResults = true;

  try {
    const storedValue = await SecureStore.getItemAsync(LOCAL_BEAUTY_RECENT_RESULTS_KEY);
    const parsedValue: unknown = storedValue ? JSON.parse(storedValue) : [];

    if (!Array.isArray(parsedValue)) {
      return;
    }

    parsedValue
      .map(normalizeStoredLocalBeautySurveyResult)
      .filter(isLocalBeautySurveyResult)
      .slice(0, LOCAL_BEAUTY_RECENT_RESULT_LIMIT)
      .reverse()
      .forEach(saveLocalBeautySurveyResultInMemory);
  } catch {
    // Recent results are a convenience; keep the current survey flow usable.
  }
}

async function persistRecentLocalBeautySurveyResults() {
  const recentResults = recentResultIds
    .map(resultId => surveyResultsById.get(resultId))
    .filter(isLocalBeautySurveyResult);

  try {
    await SecureStore.setItemAsync(
      LOCAL_BEAUTY_RECENT_RESULTS_KEY,
      JSON.stringify(recentResults),
      {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      },
    );
  } catch {
    // Recent results are still available in memory for the current app session.
  }
}

function isLocalBeautySurveyResult(value: unknown): value is LocalBeautySurveyResult {
  return Boolean(value);
}

function normalizeDraftAnswers(
  answers: Partial<Record<string, unknown>>,
): Partial<LocalBeautySurveyAnswers> {
  return Object.entries(answers).reduce<Partial<LocalBeautySurveyAnswers>>(
    (nextAnswers, [questionId, value]) => {
      const question = localBeautySurveyQuestions.find(
        nextQuestion => nextQuestion.id === questionId,
      );
      const optionIds = normalizeLocalBeautySurveyAnswerOptionIds(
        typeof value === 'string' || Array.isArray(value) ? value : undefined,
        question?.options.map(option => option.id),
      );

      if (optionIds.length === 0) {
        return nextAnswers;
      }

      nextAnswers[questionId] = optionIds;
      return nextAnswers;
    },
    {},
  );
}

function normalizeStoredLocalBeautySurveyResult(
  value: unknown,
): LocalBeautySurveyResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<LocalBeautySurveyResult>;

  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.analyzedAt !== 'string' ||
    !candidate.surveyAnswers ||
    typeof candidate.surveyAnswers !== 'object'
  ) {
    return null;
  }

  const surveyAnswers = localBeautySurveyQuestions.reduce<LocalBeautySurveyAnswers>(
    (nextAnswers, question) => {
      const optionIds = normalizeLocalBeautySurveyAnswerOptionIds(
        (candidate.surveyAnswers as Partial<Record<string, unknown>>)[question.id] as
          | string
          | readonly string[]
          | undefined,
        question.options.map(option => option.id),
      );

      nextAnswers[question.id] =
        optionIds.length > 0 ? optionIds : [LOCAL_BEAUTY_UNKNOWN_OPTION_ID];
      return nextAnswers;
    },
    {},
  );
  const migratedResult = analyzeLocalBeautySurvey(surveyAnswers);

  return {
    ...migratedResult,
    analyzedAt: candidate.analyzedAt,
    id: candidate.id,
  };
}

function isLocalBeautySurveyDraft(value: unknown): value is LocalBeautySurveyDraft {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<LocalBeautySurveyDraft>;

  return (
    Boolean(candidate.answers) &&
    typeof candidate.answers === 'object' &&
    typeof candidate.currentQuestionId === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}
