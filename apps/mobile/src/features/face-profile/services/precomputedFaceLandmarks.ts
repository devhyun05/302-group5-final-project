export function resolveFaceAnalysisLandmarks<T>(
  precomputed: T | undefined,
  request: () => Promise<T>,
): Promise<T> {
  return precomputed === undefined ? request() : Promise.resolve(precomputed);
}
