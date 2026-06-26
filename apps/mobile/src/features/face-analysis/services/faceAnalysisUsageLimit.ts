import * as SecureStore from 'expo-secure-store';

export const FACE_ANALYSIS_USAGE_LIMIT = 2;

const FACE_ANALYSIS_USAGE_COUNT_KEY = 'aura.faceAnalysis.usageCount.v1';

export type FaceAnalysisUsageState = {
  hasRemaining: boolean;
  limit: number;
  remainingCount: number;
  usedCount: number;
};

export type FaceAnalysisUsageConsumption = {
  allowed: boolean;
  state: FaceAnalysisUsageState;
};

function createFaceAnalysisUsageState(usedCount: number): FaceAnalysisUsageState {
  const normalizedUsedCount = Math.max(0, Math.min(usedCount, FACE_ANALYSIS_USAGE_LIMIT));
  const remainingCount = Math.max(0, FACE_ANALYSIS_USAGE_LIMIT - normalizedUsedCount);

  return {
    hasRemaining: remainingCount > 0,
    limit: FACE_ANALYSIS_USAGE_LIMIT,
    remainingCount,
    usedCount: normalizedUsedCount,
  };
}

async function readFaceAnalysisUsageCount(): Promise<number> {
  try {
    const storedValue = await SecureStore.getItemAsync(FACE_ANALYSIS_USAGE_COUNT_KEY);
    const parsedValue = Number(storedValue);

    return Number.isFinite(parsedValue) ? parsedValue : 0;
  } catch {
    return 0;
  }
}

async function saveFaceAnalysisUsageCount(usedCount: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      FACE_ANALYSIS_USAGE_COUNT_KEY,
      String(usedCount),
      {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      },
    );
  } catch {
    // Keep the in-app flow usable even if secure storage is unavailable.
  }
}

export async function getFaceAnalysisUsageState(): Promise<FaceAnalysisUsageState> {
  return createFaceAnalysisUsageState(await readFaceAnalysisUsageCount());
}

export async function consumeFaceAnalysisUsage(): Promise<FaceAnalysisUsageConsumption> {
  const currentUsedCount = await readFaceAnalysisUsageCount();

  if (currentUsedCount >= FACE_ANALYSIS_USAGE_LIMIT) {
    return {
      allowed: false,
      state: createFaceAnalysisUsageState(currentUsedCount),
    };
  }

  const nextUsedCount = currentUsedCount + 1;

  await saveFaceAnalysisUsageCount(nextUsedCount);

  return {
    allowed: true,
    state: createFaceAnalysisUsageState(nextUsedCount),
  };
}
