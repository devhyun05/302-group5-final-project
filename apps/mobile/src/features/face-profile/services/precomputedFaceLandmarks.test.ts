import {resolveFaceAnalysisLandmarks} from './precomputedFaceLandmarks';

async function run() {
  const precomputed = {
    faceCount: 1,
    imageHeight: 1600,
    imageWidth: 1200,
    landmarks: [{i: 0, x: 0.5, y: 0.4, z: 0}],
    pose: {pitchDeg: 0, rollDeg: 0, yawDeg: 0},
    requestId: 'once',
    status: 'ok' as const,
  };
  let requestCount = 0;
  const reused = await resolveFaceAnalysisLandmarks(precomputed, async () => {
    requestCount += 1;
    return precomputed;
  });

  if (reused !== precomputed || Number(requestCount) !== 0) {
    throw new Error('precomputed landmarks must be reused by identity without re-request');
  }

  const requested = await resolveFaceAnalysisLandmarks(undefined, async () => {
    requestCount += 1;
    return precomputed;
  });
  if (requested !== precomputed || Number(requestCount) !== 1) {
    throw new Error('missing precomputed landmarks must request exactly once');
  }

  console.log('precomputedFaceLandmarks tests passed');
}

void run();
