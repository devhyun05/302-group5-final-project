// 개발 lab 전용 온디바이스 아티팩트. production 기본 정책은 none이며 디렉터리조차
// 만들지 않는다. debug_local도 원본/결과를 업로드하지 않는다.

import * as FileSystem from 'expo-file-system/legacy';

import type { AuraPersonalColorResult } from './personalColorCore/contracts';

const ROOT_DIRECTORY_NAME = 'personal-color';
const SOURCE_FILE_NAME = 'source.jpg';
const SWATCH_FILE_NAME = 'swatch-strip.png';
const RESULT_FILE_NAME = 'personalColorResult.json';

export type PersonalColorArtifactPolicy = 'none' | 'debug_local';

export function getPersonalColorSessionDirUri(sessionId: string): string | null {
  if (!FileSystem.documentDirectory) {
    return null;
  }
  return `${FileSystem.documentDirectory}${ROOT_DIRECTORY_NAME}/${sessionId}/`;
}

export async function ensureSessionDirectory(sessionId: string): Promise<string | null> {
  const directoryUri = getPersonalColorSessionDirUri(sessionId);
  if (!directoryUri) {
    return null;
  }
  await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  return directoryUri;
}

export async function saveSourceImage(
  sessionId: string,
  sourceUri: string,
  artifactPolicy: PersonalColorArtifactPolicy = 'none',
): Promise<string | null> {
  if (artifactPolicy !== 'debug_local') return null;
  const directoryUri = await ensureSessionDirectory(sessionId);
  if (!directoryUri) {
    return null;
  }
  const fileUri = `${directoryUri}${SOURCE_FILE_NAME}`;
  await FileSystem.copyAsync({ from: sourceUri, to: fileUri });
  return fileUri;
}

export async function saveSwatchStrip(
  sessionId: string,
  tmpPngUri: string,
  artifactPolicy: PersonalColorArtifactPolicy = 'none',
): Promise<string | null> {
  if (artifactPolicy !== 'debug_local') return null;
  const directoryUri = await ensureSessionDirectory(sessionId);
  if (!directoryUri) {
    return null;
  }
  const fileUri = `${directoryUri}${SWATCH_FILE_NAME}`;
  await FileSystem.copyAsync({ from: tmpPngUri, to: fileUri });
  return fileUri;
}

export function getPersonalColorResultJsonUri(sessionId: string): string | null {
  const directoryUri = getPersonalColorSessionDirUri(sessionId);
  return directoryUri ? `${directoryUri}${RESULT_FILE_NAME}` : null;
}

export async function writeResultJson(
  sessionId: string,
  result: AuraPersonalColorResult,
  artifactPolicy: PersonalColorArtifactPolicy = 'none',
): Promise<string | null> {
  if (artifactPolicy !== 'debug_local') return null;
  const directoryUri = await ensureSessionDirectory(sessionId);
  if (!directoryUri) {
    return null;
  }
  const fileUri = `${directoryUri}${RESULT_FILE_NAME}`;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(result, null, 2));
  return fileUri;
}

// longTermRawAnalyzerArtifactStored:false 이행 — debug_local 원본 프레임 삭제
export async function deleteSourceImage(sessionId: string): Promise<void> {
  const directoryUri = getPersonalColorSessionDirUri(sessionId);
  if (!directoryUri) {
    return;
  }
  const fileUri = `${directoryUri}${SOURCE_FILE_NAME}`;
  const info = await FileSystem.getInfoAsync(fileUri);
  if (info.exists) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  }
}

// "내 색상 데이터 삭제" — 세션 트리 전체 purge. sessionId 없으면 루트 전체.
export async function deletePersonalColorData(sessionId?: string): Promise<void> {
  if (!FileSystem.documentDirectory) {
    return;
  }
  const target = sessionId
    ? getPersonalColorSessionDirUri(sessionId)
    : `${FileSystem.documentDirectory}${ROOT_DIRECTORY_NAME}/`;
  if (!target) {
    return;
  }
  const info = await FileSystem.getInfoAsync(target);
  if (info.exists) {
    await FileSystem.deleteAsync(target, { idempotent: true });
  }
}
