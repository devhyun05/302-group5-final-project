import type {
  FaceShapeLabel,
  FaceShapeRuleResult,
} from '../../../shared/types/faceProfile';

const PRESENTATION_EPSILON = 1e-9;

export const FACE_SHAPE_KOREAN_LABELS: Record<FaceShapeLabel, string> = {
  diamond: '다이아몬드형',
  heart: '하트형',
  oblong: '긴형',
  oval: '타원형',
  round: '둥근형',
  square: '각진형',
  triangle: '삼각형',
};

export type FaceShapePresentation = {
  detail: string;
  headline: string;
};

export function getFaceShapePresentation(
  result: FaceShapeRuleResult,
): FaceShapePresentation {
  if (
    result.status === 'blocked' ||
    result.dominantShape === null ||
    result.top2.length < 2
  ) {
    return {
      detail: '얼굴 윤곽이 잘 보이도록 정면에서 다시 촬영해 주세요.',
      headline: '얼굴형을 판단할 정보가 부족해요',
    };
  }

  const dominantLabel = FACE_SHAPE_KOREAN_LABELS[result.dominantShape];
  const secondLabel = FACE_SHAPE_KOREAN_LABELS[result.top2[1].shape];
  const gap =
    result.confidenceGap ??
    Math.max(0, result.top2[0].score - result.top2[1].score);
  const detail = result.explanationTraits.join(' · ');

  if (gap + PRESENTATION_EPSILON < 0.1) {
    return {
      detail,
      headline: `${dominantLabel}과 ${secondLabel}이 함께 보여요`,
    };
  }
  if (gap + PRESENTATION_EPSILON < 0.2) {
    return {
      detail,
      headline: `${dominantLabel}에 조금 더 가까워요`,
    };
  }
  return {
    detail,
    headline: `${dominantLabel} 얼굴형이에요`,
  };
}
