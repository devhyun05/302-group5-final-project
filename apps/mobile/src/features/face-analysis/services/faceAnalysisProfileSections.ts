import type {FaceAnalysisProfileSummary} from '../../../shared/services/faceAnalysisProfileMapping';
import {getFaceProfileRetakeMessage} from '../../../shared/services/faceAnalysisProfileMapping';
import type {
  FaceColorSample,
  FaceMeasurement,
  FaceMeasurementSource,
  FaceProfileResult,
  PersonalColor12Type,
  PersonalColorAxisName,
  PersonalColorSummary,
} from '../../../shared/types/faceProfile';
import {
  FACE_SHAPE_KOREAN_LABELS,
  getFaceShapePresentation,
} from '../../face-profile/services/faceProfilePresentation';

export const FACE_PROFILE_SECTION_IDS = [
  'face_shape',
  'face_balance',
  'eyes_brows',
  'nose_mouth',
  'skin_color',
  'quality',
] as const;

export type FaceAnalysisProfileSectionId =
  (typeof FACE_PROFILE_SECTION_IDS)[number];
export type FaceProfileConfidenceLevel = 'high' | 'medium' | 'low';

export type FaceProfileMeasurementItem = {
  confidenceLabel: string;
  confidenceLevel: FaceProfileConfidenceLevel;
  id: string;
  isKey: boolean;
  label: string;
  nullReason?: string;
  sourceLabel: string;
  value: string;
  warnings: string[];
};

export type FaceShapeProfileSectionPresentation = {
  detail: string;
  headline: string;
  retakeReasons: string[];
  status: 'ready' | 'mixed' | 'blocked';
  topTwo: Array<{label: string; scoreLabel: string}>;
  traits: string[];
};

export type FaceProfileQualitySectionPresentation = {
  retakeReasons: string[];
  trueDepthLabel: string;
};

type FaceAnalysisProfileSectionBase = {
  id: FaceAnalysisProfileSectionId;
  interpretation: string;
  measurements: FaceProfileMeasurementItem[];
  title: string;
  warnings: string[];
};

export type FaceShapeProfileSectionModel =
  FaceAnalysisProfileSectionBase & {
    faceShape: FaceShapeProfileSectionPresentation;
    id: 'face_shape';
    measurements: [];
  };

export type FaceProfileMeasurementSectionModel =
  FaceAnalysisProfileSectionBase & {
    id: 'face_balance' | 'eyes_brows' | 'nose_mouth' | 'skin_color';
  };

export type FaceProfileQualitySectionModel =
  FaceAnalysisProfileSectionBase & {
    id: 'quality';
    quality: FaceProfileQualitySectionPresentation;
  };

export type FaceAnalysisProfileSection =
  | FaceShapeProfileSectionModel
  | FaceProfileMeasurementSectionModel
  | FaceProfileQualitySectionModel;

type MeasurementFormat =
  | 'boolean'
  | 'color'
  | 'count'
  | 'delta_e'
  | 'degree'
  | 'depth_accuracy'
  | 'distance'
  | 'number'
  | 'percent'
  | 'personal_color'
  | 'ratio';

type MeasurementSpec = {
  format: MeasurementFormat;
  isKey?: boolean;
  key: string;
  label: string;
};

const SOURCE_LABELS: Record<FaceMeasurementSource, string> = {
  apple_semantic_matte: '기기 내 헤어라인 분석',
  camera_metadata: '카메라 촬영 정보',
  derived: '파생 계산',
  estimated: '추정값',
  mediapipe_2d: '기기 내 2D 얼굴 측정',
  pixel_roi: '기기 내 색상 영역 분석',
  truedepth_3d: 'TrueDepth 3D',
};

const PERSONAL_COLOR_LABELS: Record<PersonalColor12Type, string> = {
  autumn_deep: '가을 딥',
  autumn_muted: '가을 뮤트',
  autumn_true: '가을 트루',
  spring_bright: '봄 브라이트',
  spring_light: '봄 라이트',
  spring_true: '봄 트루',
  summer_light: '여름 라이트',
  summer_muted: '여름 뮤트',
  summer_true: '여름 트루',
  winter_bright: '겨울 브라이트',
  winter_deep: '겨울 딥',
  winter_true: '겨울 트루',
};

const PERSONAL_COLOR_AXIS_LABELS: Record<PersonalColorAxisName, string> = {
  chroma: '채도 축',
  clarity: '맑기 축',
  contrast: '대비 축',
  temperature: '온도감 축',
  value: '명도 축',
};

const PERSONAL_COLOR_STATUS_LABELS: Record<
  PersonalColorSummary['status'],
  string
> = {
  definitive: '확정',
  insufficient: '판정 보류',
  mixed: '혼합',
  provisional: '잠정',
};

const PERSONAL_COLOR_SEASON_LABELS: Record<
  NonNullable<PersonalColorSummary['tone']>['season'],
  string
> = {
  autumn: '가을',
  spring: '봄',
  summer: '여름',
  winter: '겨울',
};

const FACE_SHAPE_GAP_THRESHOLD = 0.1;
const FACE_SHAPE_GAP_EPSILON = 1e-9;

const REASON_COPY: Record<string, string> = {
  blur_risk: '사진이 다소 흐려 일부 측정 정밀도가 낮을 수 있어요.',
  camera_metadata_unavailable: '카메라 촬영 정보 일부를 확인하지 못했어요.',
  camera_stability_unavailable: '촬영 순간의 카메라 안정성을 확인하지 못했어요.',
  camera_unstable: '촬영 순간에 카메라가 흔들렸어요.',
  colored_lighting: '색이 강한 조명으로 색상 측정이 제한됐어요.',
  contrast_regions_missing: '얼굴 대비를 비교할 색상 영역이 부족했어요.',
  depth_error: 'TrueDepth 보조 측정을 완료하지 못했어요.',
  depth_unsupported: '이 기기에서는 TrueDepth 보조 측정을 사용할 수 없어요.',
  face_landmarks_error: '얼굴 기준점을 안정적으로 측정하지 못했어요.',
  face_landmarks_timeout: '얼굴 측정 시간을 초과했어요.',
  face_not_detected: '얼굴을 찾지 못했어요.',
  face_not_centered: '얼굴이 가이드 중앙에서 벗어났어요.',
  face_too_close: '카메라와 얼굴 거리가 너무 가까웠어요.',
  face_too_far: '카메라와 얼굴 거리가 너무 멀었어요.',
  hair_missing: '헤어 색상 영역이 부족해 퍼스널 컬러 결과를 참고용으로 표시해요.',
  hairline_unavailable: '헤어라인이 분명하지 않아 이마 관련 측정을 제외했어요.',
  landmarks_incomplete: '얼굴 기준점이 부족해 이 항목을 측정하지 못했어요.',
  landmark_confidence_is_estimated: '얼굴 기준점 신뢰도에 추정값이 포함됐어요.',
  landmark_confidence_partial_evidence: '얼굴 기준점 신뢰도를 일부 정보로 계산했어요.',
  lighting_high: '조명이 너무 밝아 일부 색상 측정이 제한될 수 있어요.',
  lighting_low: '조명이 어두워 일부 측정이 제한될 수 있어요.',
  lighting_unavailable: '촬영 조명 품질을 확인하지 못했어요.',
  lighting_uneven: '얼굴에 빛이 고르게 닿지 않았어요.',
  low_confidence: '측정 신뢰도가 부족해 결과를 제외했어요.',
  multiple_faces: '여러 얼굴이 감지돼 이 항목을 측정하지 않았어요.',
  personal_color_unavailable: '색상 판정에 필요한 조명과 픽셀 정보가 부족했어요.',
  pixel_quality_unavailable: '선명도와 조명 품질을 확인할 픽셀 정보가 부족했어요.',
  pose_out_of_range: '정면 각도가 아니어서 이 항목을 측정하지 못했어요.',
  pose_unavailable: '얼굴 각도를 확인할 수 없어요.',
  relative_capture_value_not_medical_diagnosis: '붉은기와 황색도는 현재 촬영 환경에서 비교한 상대값이며 의료 진단이 아니에요.',
  relative_depth_has_no_camera_distance: '상대 깊이만 확인해 실제 카메라 거리는 표시하지 않아요.',
  screen_coverage_unavailable: '화면 안의 얼굴 비중을 확인하지 못했어요.',
  truedepth_unavailable: 'TrueDepth 정보가 없어 2D 측정을 사용했어요.',
  vertical_thirds_unavailable: '헤어라인이 분명하지 않아 세로 비율 일부를 측정하지 못했어요.',
  white_balance_unavailable: '카메라 화이트 밸런스 정보를 확인하지 못했어요.',
};

const TRAIT_COPY: Record<string, string> = {
  balanced_length: '얼굴 세로·가로 비율이 균형에 가까워요',
  soft_jaw: '턱선이 부드럽게 이어져요',
};

const BALANCE_SPECS: readonly MeasurementSpec[] = [
  {format: 'ratio', isKey: true, key: 'faceLengthToWidth', label: '얼굴 세로/가로 비율'},
  {format: 'ratio', isKey: true, key: 'faceLengthToCheekWidth', label: '얼굴 길이/광대 폭 비율'},
  {format: 'ratio', isKey: true, key: 'upperThirdRatio', label: '상안부 기준비'},
  {format: 'ratio', isKey: true, key: 'middleThirdRatio', label: '중안부 기준비'},
  {format: 'ratio', isKey: true, key: 'lowerThirdRatio', label: '하안부 기준비'},
  {format: 'ratio', key: 'foreheadWidthToCheekWidth', label: '이마/광대 폭 비율'},
  {format: 'ratio', key: 'templeWidthToCheekWidth', label: '관자/광대 폭 비율'},
  {format: 'ratio', isKey: true, key: 'jawWidthToCheekWidth', label: '턱/광대 폭 비율'},
  {format: 'ratio', isKey: true, key: 'chinWidthToCheekWidth', label: '턱끝/광대 폭 비율'},
  {format: 'ratio', key: 'cheekToJawRatio', label: '광대/턱 비율'},
  {format: 'percent', key: 'cheekDominance', label: '광대 도드라짐'},
  {format: 'ratio', key: 'jawlineLengthRatio', label: '턱선 길이 비율'},
  {format: 'degree', isKey: true, key: 'jawAngleDeg', label: '턱선 각도'},
  {format: 'percent', key: 'jawWidthScore', label: '턱 폭 지수'},
  {format: 'percent', key: 'jawAngleScore', label: '턱 각 지수'},
  {format: 'percent', isKey: true, key: 'jawSoftness', label: '턱선 부드러움'},
  {format: 'percent', key: 'chinPointedness', label: '턱끝 날카로움'},
  {format: 'percent', key: 'contourRoundness', label: '윤곽 곡선감'},
  {format: 'percent', key: 'foreheadDominance', label: '이마 도드라짐'},
  {format: 'percent', key: 'lowerFaceWeight', label: '하관 비중'},
  {format: 'percent', key: 'contourAsymmetry', label: '윤곽 비대칭'},
];

const EYES_BROWS_SPECS: readonly MeasurementSpec[] = [
  {format: 'ratio', isKey: true, key: 'leftEyeAspectRatio', label: '왼쪽 눈 세로/가로 비율'},
  {format: 'ratio', isKey: true, key: 'rightEyeAspectRatio', label: '오른쪽 눈 세로/가로 비율'},
  {format: 'ratio', isKey: true, key: 'interEyeDistanceRatio', label: '눈 사이 거리 비율'},
  {format: 'degree', key: 'leftEyeCanthalTiltDeg', label: '왼쪽 눈꼬리 각도'},
  {format: 'degree', key: 'rightEyeCanthalTiltDeg', label: '오른쪽 눈꼬리 각도'},
  {format: 'ratio', key: 'leftBrowEyeDistanceRatio', label: '왼쪽 눈썹-눈 거리 비율'},
  {format: 'ratio', key: 'rightBrowEyeDistanceRatio', label: '오른쪽 눈썹-눈 거리 비율'},
  {format: 'degree', key: 'leftBrowTiltDeg', label: '왼쪽 눈썹 기울기'},
  {format: 'degree', key: 'rightBrowTiltDeg', label: '오른쪽 눈썹 기울기'},
  {format: 'percent', key: 'eyeAsymmetry', label: '눈 비대칭'},
  {format: 'percent', key: 'browAsymmetry', label: '눈썹 비대칭'},
];

const NOSE_SPECS: readonly MeasurementSpec[] = [
  {format: 'ratio', isKey: true, key: 'noseLengthRatio', label: '코 길이 비율'},
  {format: 'ratio', isKey: true, key: 'noseWidthRatio', label: '코 너비 비율'},
  {format: 'ratio', key: 'noseToMidfaceRatio', label: '코/중안부 비율'},
  {format: 'ratio', key: 'noseTipToMouthRatio', label: '코끝-입 거리 비율'},
  {format: 'percent', key: 'centerlineAsymmetry', label: '코 중심선 비대칭'},
];

const MOUTH_SPECS: readonly MeasurementSpec[] = [
  {format: 'ratio', isKey: true, key: 'lipFullnessRatio', label: '입술 두께 비율'},
  {format: 'ratio', isKey: true, key: 'mouthWidthRatio', label: '입 너비 비율'},
  {format: 'ratio', key: 'upperToLowerLipRatio', label: '위/아래 입술 비율'},
  {format: 'degree', key: 'leftCornerTiltDeg', label: '왼쪽 입꼬리 각도'},
  {format: 'degree', key: 'rightCornerTiltDeg', label: '오른쪽 입꼬리 각도'},
  {format: 'percent', key: 'mouthAsymmetry', label: '입 비대칭'},
];

const COLOR_SPECS: readonly MeasurementSpec[] = [
  {format: 'delta_e', isKey: true, key: 'overallFaceContrast', label: '얼굴 전체 대비'},
  {format: 'delta_e', key: 'eyeSkinContrast', label: '눈-피부 대비'},
  {format: 'delta_e', key: 'browSkinContrast', label: '눈썹-피부 대비'},
  {format: 'delta_e', key: 'lipSkinContrast', label: '입술-피부 대비'},
  {format: 'percent', isKey: true, key: 'skinEvenness', label: '피부 균일도'},
  {format: 'percent', isKey: true, key: 'redness', label: '상대 붉은기'},
  {format: 'percent', isKey: true, key: 'yellowness', label: '상대 황색도'},
  {format: 'color', key: 'skinColor', label: '피부 대표 색'},
  {format: 'color', key: 'hairColor', label: '헤어 대표 색'},
  {format: 'color', key: 'lipColor', label: '입술 대표 색'},
  {format: 'color', key: 'leftEyeColor', label: '왼쪽 눈 대표 색'},
  {format: 'color', key: 'rightEyeColor', label: '오른쪽 눈 대표 색'},
  {format: 'color', key: 'leftBrowColor', label: '왼쪽 눈썹 대표 색'},
  {format: 'color', key: 'rightBrowColor', label: '오른쪽 눈썹 대표 색'},
  {format: 'personal_color', isKey: true, key: 'personalColor', label: '퍼스널 컬러'},
];

const QUALITY_SPECS: readonly MeasurementSpec[] = [
  {format: 'count', key: 'faceCount', label: '감지된 얼굴 수'},
  {format: 'count', key: 'landmarkCount', label: '얼굴 기준점 수'},
  {format: 'degree', isKey: true, key: 'yawDeg', label: '좌우 각도'},
  {format: 'degree', isKey: true, key: 'pitchDeg', label: '상하 각도'},
  {format: 'degree', key: 'rollDeg', label: '기울기'},
  {format: 'percent', isKey: true, key: 'frontalScore', label: '정면 점수'},
  {format: 'percent', key: 'centeredScore', label: '중앙 정렬'},
  {format: 'percent', isKey: true, key: 'framingScore', label: '프레이밍'},
  {format: 'distance', key: 'cameraDistanceMeters', label: '카메라 거리'},
  {format: 'percent', key: 'screenCoverageRatio', label: '화면 얼굴 비중'},
  {format: 'percent', key: 'cameraStability', label: '카메라 안정성'},
  {format: 'percent', isKey: true, key: 'blurScore', label: '선명도'},
  {format: 'percent', isKey: true, key: 'lightingScore', label: '조명 품질'},
  {format: 'percent', key: 'overexposureRisk', label: '과노출 위험'},
  {format: 'percent', key: 'underexposureRisk', label: '저노출 위험'},
  {format: 'percent', key: 'coloredLightingRisk', label: '색 조명 위험'},
  {format: 'percent', key: 'neutralExpressionScore', label: '중립 표정'},
  {format: 'percent', key: 'eyeClosureRisk', label: '눈 감김 위험'},
  {format: 'percent', key: 'mouthOpenRisk', label: '입 벌림 위험'},
  {format: 'percent', key: 'hairlineConfidence', label: '헤어라인 신뢰도'},
  {format: 'percent', key: 'occlusionRisk', label: '가림 위험'},
  {format: 'percent', key: 'landmarkConfidence', label: '기준점 신뢰도'},
  {format: 'boolean', key: 'depthAvailable', label: 'TrueDepth 정보'},
  {format: 'depth_accuracy', key: 'depthAccuracy', label: '깊이 정확도 방식'},
  {format: 'boolean', key: 'depthFiltered', label: '깊이 필터 적용'},
  {format: 'percent', key: 'depthValidSampleRatio', label: '유효 깊이 샘플 비율'},
  {format: 'distance', key: 'depthMedianAbsoluteDeviationMeters', label: '깊이 오차 범위'},
  {format: 'percent', key: 'depthConfidence', label: '깊이 신뢰도'},
  {format: 'degree', key: 'facePlanePitchDeg', label: '얼굴면 상하 각도'},
  {format: 'degree', key: 'facePlaneYawDeg', label: '얼굴면 좌우 각도'},
  {format: 'degree', key: 'facePlaneRollDeg', label: '얼굴면 기울기'},
  {format: 'percent', key: 'facePlaneConfidence', label: '얼굴면 신뢰도'},
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function formatPercent(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function formatColor(value: FaceColorSample): string {
  return value.hex.toUpperCase();
}

function formatPersonalColor(value: PersonalColorSummary): string {
  if (!value.tone) {
    return '판정 보류';
  }
  const top = PERSONAL_COLOR_LABELS[value.tone.top];
  const secondary = value.tone.secondary
    ? PERSONAL_COLOR_LABELS[value.tone.secondary]
    : null;
  return secondary ? `${top} · 보조 ${secondary}` : top;
}

function formatValue(value: unknown, format: MeasurementFormat): string {
  if (format === 'color' && value && typeof value === 'object') {
    return formatColor(value as FaceColorSample);
  }
  if (format === 'personal_color' && value && typeof value === 'object') {
    return formatPersonalColor(value as PersonalColorSummary);
  }
  if (format === 'boolean' && typeof value === 'boolean') {
    return value ? '사용 가능' : '사용하지 않음';
  }
  if (format === 'depth_accuracy') {
    return value === 'absolute'
      ? '절대 깊이'
      : value === 'relative'
        ? '상대 깊이'
        : '측정 불가';
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '측정 완료';
  }
  if (format === 'count') {
    return `${Math.round(value)}개`;
  }
  if (format === 'degree') {
    return `${value.toFixed(1)}°`;
  }
  if (format === 'delta_e') {
    return `ΔE00 ${value.toFixed(1)}`;
  }
  if (format === 'distance') {
    return `${(value * 100).toFixed(1)}cm`;
  }
  if (format === 'percent') {
    return formatPercent(value);
  }
  if (format === 'ratio') {
    return value.toFixed(2);
  }
  return value.toFixed(2);
}

function confidencePresentation(confidence: number): {
  label: string;
  level: FaceProfileConfidenceLevel;
} {
  const normalized = clamp01(confidence);
  if (normalized >= 0.85) {
    return {label: `신뢰도 높음 · ${formatPercent(normalized)}`, level: 'high'};
  }
  if (normalized >= 0.65) {
    return {label: `신뢰도 보통 · ${formatPercent(normalized)}`, level: 'medium'};
  }
  return {label: `참고용 · ${formatPercent(normalized)}`, level: 'low'};
}

function humanizeReason(reason: string | null | undefined): string | undefined {
  if (!reason) {
    return undefined;
  }
  return (
    REASON_COPY[reason] ??
    '촬영 품질 또는 측정 정보가 부족해 이 항목을 확인하지 못했어요.'
  );
}

function humanizeWarning(warning: string): string {
  return (
    REASON_COPY[warning] ??
    '일부 측정 조건을 충분히 확인하지 못해 결과를 참고용으로 표시해요.'
  );
}

function unique(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function buildMeasurementItems(
  values: Record<string, FaceMeasurement<unknown>>,
  specs: readonly MeasurementSpec[],
): FaceProfileMeasurementItem[] {
  return specs.map(spec => {
    const measurement = values[spec.key];
    const confidence = confidencePresentation(measurement.confidence);
    const unavailable = measurement.value === null;
    return {
      confidenceLabel: confidence.label,
      confidenceLevel: confidence.level,
      id: spec.key,
      isKey: spec.isKey ?? false,
      label: spec.label,
      nullReason: unavailable
        ? humanizeReason(measurement.nullReason)
        : undefined,
      sourceLabel: SOURCE_LABELS[measurement.source],
      value: unavailable ? '측정 불가' : formatValue(measurement.value, spec.format),
      warnings: unique(measurement.warnings.map(humanizeWarning)),
    };
  });
}

function personalColorDetailItem({
  confidence,
  id,
  label,
  source,
  value,
}: {
  confidence: number;
  id: string;
  label: string;
  source: FaceMeasurementSource;
  value: string;
}): FaceProfileMeasurementItem {
  const confidenceModel = confidencePresentation(confidence);
  return {
    confidenceLabel: confidenceModel.label,
    confidenceLevel: confidenceModel.level,
    id,
    isKey: false,
    label,
    sourceLabel: SOURCE_LABELS[source],
    value,
    warnings: [],
  };
}

function formatNullablePersonalColorNumber(
  value: number | null,
  prefix = '',
): string {
  return value === null ? '측정 불가' : `${prefix}${value.toFixed(2)}`;
}

function buildPersonalColorDetailItems(
  measurement: FaceMeasurement<PersonalColorSummary>,
): FaceProfileMeasurementItem[] {
  const personalColor = measurement.value;
  if (!personalColor) {
    return [];
  }

  const item = (
    id: string,
    label: string,
    value: string,
    confidence = personalColor.measurementConfidence,
  ) =>
    personalColorDetailItem({
      confidence,
      id,
      label,
      source: measurement.source,
      value,
    });
  const axisItems = (
    Object.keys(PERSONAL_COLOR_AXIS_LABELS) as PersonalColorAxisName[]
  ).map(axisName => {
    const axis = personalColor.axes[axisName];
    return item(
      `personalColorAxis${axisName[0].toUpperCase()}${axisName.slice(1)}`,
      PERSONAL_COLOR_AXIS_LABELS[axisName],
      formatNullablePersonalColorNumber(axis.value),
      axis.confidence,
    );
  });
  const relationItems = [
    item(
      'personalColorRelationDLSkinHair',
      '피부-헤어 명도 차이',
      personalColor.relations.dLSkinHair === null
        ? '측정 불가'
        : `ΔL* ${personalColor.relations.dLSkinHair.toFixed(1)}`,
    ),
    item(
      'personalColorRelationDLSkinLip',
      '피부-입술 명도 차이',
      personalColor.relations.dLSkinLip === null
        ? '측정 불가'
        : `ΔL* ${personalColor.relations.dLSkinLip.toFixed(1)}`,
    ),
    item(
      'personalColorRelationDE00SkinHair',
      '피부-헤어 색 차이',
      personalColor.relations.dE00SkinHair === null
        ? '측정 불가'
        : `ΔE00 ${personalColor.relations.dE00SkinHair.toFixed(1)}`,
    ),
    item(
      'personalColorRelationDE00SkinLip',
      '피부-입술 색 차이',
      personalColor.relations.dE00SkinLip === null
        ? '측정 불가'
        : `ΔE00 ${personalColor.relations.dE00SkinLip.toFixed(1)}`,
    ),
  ];
  const tone = personalColor.tone;
  const toneSummaryItems = [
    item(
      'personalColorToneTop',
      '1순위 톤',
      tone ? PERSONAL_COLOR_LABELS[tone.top] : '판정 보류',
    ),
    item(
      'personalColorToneSecondary',
      '2순위 톤',
      tone?.secondary ? PERSONAL_COLOR_LABELS[tone.secondary] : '없음',
    ),
    item(
      'personalColorToneSeason',
      '계절군',
      tone ? PERSONAL_COLOR_SEASON_LABELS[tone.season] : '판정 보류',
    ),
    item(
      'personalColorToneScore',
      '1순위 점수',
      tone ? formatPercent(tone.score) : '측정 불가',
    ),
    item(
      'personalColorToneGap',
      '1·2순위 점수 차이',
      tone ? formatPercent(tone.gap) : '측정 불가',
    ),
  ];
  const toneScoreItems = tone
    ? (Object.keys(PERSONAL_COLOR_LABELS) as PersonalColor12Type[]).map(toneName =>
        item(
          `personalColorToneScore.${toneName}`,
          `${PERSONAL_COLOR_LABELS[toneName]} 점수`,
          formatPercent(tone.toneScores[toneName]),
        ),
      )
    : [];
  const toneDistanceItems = tone
    ? (Object.keys(PERSONAL_COLOR_LABELS) as PersonalColor12Type[]).map(toneName =>
        item(
          `personalColorToneDistance.${toneName}`,
          `${PERSONAL_COLOR_LABELS[toneName]} 거리`,
          tone.toneDistances[toneName].toFixed(2),
        ),
      )
    : [];

  return [
    item(
      'personalColorStatus',
      '판정 상태',
      PERSONAL_COLOR_STATUS_LABELS[personalColor.status],
    ),
    item(
      'personalColorMeasurementConfidence',
      '전체 판정 신뢰도',
      formatPercent(personalColor.measurementConfidence),
    ),
    ...axisItems,
    ...relationItems,
    ...toneSummaryItems,
    ...toneScoreItems,
    ...toneDistanceItems,
    item(
      'personalColorPaletteBest',
      '잘 어울리는 팔레트 ID',
      personalColor.palette.bestFamilyIds.join(' · ') || '없음',
    ),
    item(
      'personalColorPaletteWorst',
      '피하면 좋은 팔레트 ID',
      personalColor.palette.worstFamilyIds.join(' · ') || '없음',
    ),
    item(
      'personalColorCalibrationApplied',
      '색상 보정',
      personalColor.calibrationApplied ? '적용됨' : '적용 안 됨',
    ),
    item(
      'personalColorCalibrationVersion',
      '색상 보정 버전',
      personalColor.calibrationVersion ?? '없음',
    ),
  ];
}

function buildColorMeasurementItems(
  profile: FaceProfileResult,
): FaceProfileMeasurementItem[] {
  const items = buildMeasurementItems(
    asMeasurementRecord(profile.color),
    COLOR_SPECS,
  );
  const personalColorMeasurement = profile.color.personalColor;
  const nestedWarnings = personalColorMeasurement.value?.warnings.map(
    humanizeWarning,
  ) ?? [];
  const personalColorItemIndex = items.findIndex(
    item => item.id === 'personalColor',
  );
  if (personalColorItemIndex >= 0 && nestedWarnings.length > 0) {
    const personalColorItem = items[personalColorItemIndex];
    items[personalColorItemIndex] = {
      ...personalColorItem,
      warnings: unique([...personalColorItem.warnings, ...nestedWarnings]),
    };
  }
  return [
    ...items,
    ...buildPersonalColorDetailItems(personalColorMeasurement),
  ];
}

function colorSectionWarnings(profile: FaceProfileResult): string[] {
  return unique(
    Object.values(profile.color).flatMap(measurement =>
      measurement.warnings.map(humanizeWarning),
    ),
  );
}

function sectionWarnings(items: FaceProfileMeasurementItem[]): string[] {
  return unique(items.flatMap(item => item.warnings));
}

function shapeTraits(traits: string[]): string[] {
  return unique(traits.map(trait => {
    if (TRAIT_COPY[trait]) {
      return TRAIT_COPY[trait];
    }
    return /[가-힣]/.test(trait)
      ? trait
      : '얼굴 균형을 설명하는 주요 특징이에요';
  }));
}

function retakeReasons(profile: FaceProfileResult): string[] {
  const reasons = unique([
    ...profile.quality.blockingReasons,
    ...(profile.statusReason ? [profile.statusReason] : []),
  ]);
  if (reasons.length === 0 && (profile.status === 'blocked' || profile.status === 'failed')) {
    return [getFaceProfileRetakeMessage('quality_unavailable')];
  }
  return reasons.map(reason => getFaceProfileRetakeMessage(reason));
}

function buildFaceShapeSection(profile: FaceProfileResult): FaceShapeProfileSectionModel {
  const presentation = getFaceShapePresentation(profile.faceShape);
  const traits = shapeTraits(profile.faceShape.explanationTraits);
  const blocked = profile.faceShape.status === 'blocked';
  return {
    faceShape: {
      detail: traits.length > 0 ? traits.join(' · ') : presentation.detail,
      headline: presentation.headline,
      retakeReasons: blocked ? retakeReasons(profile) : [],
      status: profile.faceShape.status,
      topTwo: blocked
        ? []
        : profile.faceShape.top2.slice(0, 2).map(item => ({
            label: FACE_SHAPE_KOREAN_LABELS[item.shape],
            scoreLabel: `규칙 점수 ${formatPercent(item.score)}`,
          })),
      traits: blocked ? [] : traits,
    },
    id: 'face_shape',
    interpretation: presentation.headline,
    measurements: [],
    title: '얼굴형',
    warnings: unique(profile.faceShape.warnings.map(humanizeWarning)),
  };
}

function asMeasurementRecord(value: object): Record<string, FaceMeasurement<unknown>> {
  return value as Record<string, FaceMeasurement<unknown>>;
}

export function buildFaceAnalysisProfileSections(
  profile: FaceProfileResult,
): FaceAnalysisProfileSection[] {
  const balanceItems = buildMeasurementItems(
    asMeasurementRecord(profile.faceBalance),
    BALANCE_SPECS,
  );
  const eyesItems = buildMeasurementItems(
    asMeasurementRecord(profile.eyesAndBrows),
    EYES_BROWS_SPECS,
  );
  const noseMouthItems = [
    ...buildMeasurementItems(asMeasurementRecord(profile.nose), NOSE_SPECS),
    ...buildMeasurementItems(asMeasurementRecord(profile.mouth), MOUTH_SPECS),
  ];
  const colorItems = buildColorMeasurementItems(profile);
  const qualityItems = buildMeasurementItems(
    asMeasurementRecord(profile.quality),
    QUALITY_SPECS,
  );
  const qualityRetakeReasons = retakeReasons(profile);
  const verticalSummary = profile.existingAnalysis.verticalThirds?.summary.trim();

  return [
    buildFaceShapeSection(profile),
    {
      id: 'face_balance',
      interpretation:
        verticalSummary ||
        '얼굴의 세로·가로와 이마·광대·턱 균형을 함께 비교했어요.',
      measurements: balanceItems,
      title: '얼굴 균형',
      warnings: sectionWarnings(balanceItems),
    },
    {
      id: 'eyes_brows',
      interpretation:
        '눈의 비율·간격·기울기와 눈썹 위치를 함께 비교했어요.',
      measurements: eyesItems,
      title: '눈·눈썹',
      warnings: sectionWarnings(eyesItems),
    },
    {
      id: 'nose_mouth',
      interpretation:
        '중안부와 코, 입술·입꼬리의 비율과 균형을 함께 살펴봤어요.',
      measurements: noseMouthItems,
      title: '코·입',
      warnings: sectionWarnings(noseMouthItems),
    },
    {
      id: 'skin_color',
      interpretation:
        '피부 균일도와 얼굴 대비, 상대적인 붉은기·황색도를 함께 확인했어요.',
      measurements: colorItems,
      title: '피부·컬러',
      warnings: colorSectionWarnings(profile),
    },
    {
      id: 'quality',
      interpretation:
        profile.status === 'full_success'
          ? '정면 각도와 조명·선명도가 안정적인 분석이에요.'
          : profile.status === 'partial_success'
            ? '측정 가능한 품질 정보만 결과에 반영했어요.'
            : '재촬영 필요 사유와 측정 품질을 확인해 주세요.',
      measurements: qualityItems,
      quality: {
        retakeReasons:
          profile.status === 'blocked' || profile.status === 'failed'
            ? qualityRetakeReasons
            : [],
        trueDepthLabel: profile.provenance.trueDepthUsed
          ? 'TrueDepth 3D 보조 측정을 사용했어요.'
          : typeof profile.quality.landmarkCount.value === 'number' &&
              profile.quality.landmarkCount.value > 0 &&
              typeof profile.quality.landmarkConfidence.value === 'number' &&
              profile.quality.landmarkConfidence.value > 0
            ? '2D 얼굴 기준점으로 분석했어요.'
            : '얼굴 기준점 정보를 사용할 수 없었어요.',
      },
      title: '분석 품질',
      warnings: unique([
        ...sectionWarnings(qualityItems),
        ...profile.warnings.map(humanizeWarning),
      ]),
    },
  ];
}

export function buildFaceAnalysisProfileSectionsFromReport(
  report: {faceProfile?: FaceProfileResult | null} | null | undefined,
): FaceAnalysisProfileSection[] | null {
  return report?.faceProfile
    ? buildFaceAnalysisProfileSections(report.faceProfile)
    : null;
}

export function getFaceProfileSummaryLabel(
  summary: FaceAnalysisProfileSummary | null | undefined,
): string | undefined {
  if (!summary) {
    return undefined;
  }
  if (
    summary.status === 'blocked' ||
    summary.status === 'failed' ||
    summary.dominantShape === null
  ) {
    return '측정 불가';
  }
  const shape = FACE_SHAPE_KOREAN_LABELS[summary.dominantShape];
  return summary.confidenceGap !== null &&
    summary.confidenceGap + FACE_SHAPE_GAP_EPSILON < FACE_SHAPE_GAP_THRESHOLD
    ? `${shape} 혼합형`
    : shape;
}
