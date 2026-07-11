export const FACE_PROFILE_SCHEMA_VERSION = 'aura-face-profile-v1' as const;

export type FaceMeasurementSource =
  | 'truedepth_3d'
  | 'mediapipe_2d'
  | 'apple_semantic_matte'
  | 'pixel_roi'
  | 'camera_metadata'
  | 'derived'
  | 'estimated';

export type FaceMeasurement<T> = {
  value: T | null;
  confidence: number;
  source: FaceMeasurementSource;
  nullReason?: string;
  warnings: string[];
};

export type FaceProfileStatus =
  | 'full_success'
  | 'partial_success'
  | 'blocked'
  | 'failed';

export type FaceShapeLabel =
  | 'oval'
  | 'round'
  | 'square'
  | 'heart'
  | 'oblong'
  | 'diamond'
  | 'triangle';

export type FaceProfileQuality = {
  faceCount: FaceMeasurement<number>;
  landmarkCount: FaceMeasurement<number>;
  yawDeg: FaceMeasurement<number>;
  pitchDeg: FaceMeasurement<number>;
  rollDeg: FaceMeasurement<number>;
  frontalScore: FaceMeasurement<number>;
  centeredScore: FaceMeasurement<number>;
  framingScore: FaceMeasurement<number>;
  cameraDistanceMeters: FaceMeasurement<number>;
  screenCoverageRatio: FaceMeasurement<number>;
  cameraStability: FaceMeasurement<number>;
  blurScore: FaceMeasurement<number>;
  lightingScore: FaceMeasurement<number>;
  overexposureRisk: FaceMeasurement<number>;
  underexposureRisk: FaceMeasurement<number>;
  coloredLightingRisk: FaceMeasurement<number>;
  neutralExpressionScore: FaceMeasurement<number>;
  eyeClosureRisk: FaceMeasurement<number>;
  mouthOpenRisk: FaceMeasurement<number>;
  hairlineConfidence: FaceMeasurement<number>;
  occlusionRisk: FaceMeasurement<number>;
  landmarkConfidence: FaceMeasurement<number>;
  depthAvailable: FaceMeasurement<boolean>;
  depthAccuracy: FaceMeasurement<'absolute' | 'relative'>;
  depthFiltered: FaceMeasurement<boolean>;
  depthValidSampleRatio: FaceMeasurement<number>;
  depthMedianAbsoluteDeviationMeters: FaceMeasurement<number>;
  depthConfidence: FaceMeasurement<number>;
  facePlanePitchDeg: FaceMeasurement<number>;
  facePlaneYawDeg: FaceMeasurement<number>;
  facePlaneRollDeg: FaceMeasurement<number>;
  facePlaneConfidence: FaceMeasurement<number>;
  blockingReasons: string[];
};

export type FaceColorSample = {
  hex: string;
  lab: {L: number; a: number; b: number};
  rgb: {r: number; g: number; b: number};
};

export type PersonalColorAxisName =
  | 'temperature'
  | 'value'
  | 'chroma'
  | 'clarity'
  | 'contrast';

export type PersonalColor12Type =
  | 'spring_light'
  | 'spring_bright'
  | 'spring_true'
  | 'summer_light'
  | 'summer_true'
  | 'summer_muted'
  | 'autumn_muted'
  | 'autumn_true'
  | 'autumn_deep'
  | 'winter_bright'
  | 'winter_true'
  | 'winter_deep';

export type PersonalColorSummary = {
  status: 'definitive' | 'mixed' | 'provisional' | 'insufficient';
  measurementConfidence: number;
  axes: Record<PersonalColorAxisName, {value: number | null; confidence: number}>;
  relations: {
    dLSkinHair: number | null;
    dLSkinLip: number | null;
    dE00SkinHair: number | null;
    dE00SkinLip: number | null;
  };
  tone: {
    top: PersonalColor12Type;
    secondary: PersonalColor12Type | null;
    season: 'spring' | 'summer' | 'autumn' | 'winter';
    score: number;
    gap: number;
    toneScores: Record<PersonalColor12Type, number>;
    toneDistances: Record<PersonalColor12Type, number>;
  } | null;
  palette: {
    bestFamilyIds: string[];
    worstFamilyIds: string[];
  };
  calibrationApplied: boolean;
  calibrationVersion: string | null;
  warnings: string[];
};

export type FaceProfileColor = {
  overallFaceContrast: FaceMeasurement<number>;
  eyeSkinContrast: FaceMeasurement<number>;
  browSkinContrast: FaceMeasurement<number>;
  lipSkinContrast: FaceMeasurement<number>;
  skinEvenness: FaceMeasurement<number>;
  redness: FaceMeasurement<number>;
  yellowness: FaceMeasurement<number>;
  skinColor: FaceMeasurement<FaceColorSample>;
  hairColor: FaceMeasurement<FaceColorSample>;
  lipColor: FaceMeasurement<FaceColorSample>;
  leftEyeColor: FaceMeasurement<FaceColorSample>;
  rightEyeColor: FaceMeasurement<FaceColorSample>;
  leftBrowColor: FaceMeasurement<FaceColorSample>;
  rightBrowColor: FaceMeasurement<FaceColorSample>;
  personalColor: FaceMeasurement<PersonalColorSummary>;
};

export type FaceProfileBalance = {
  faceLengthToWidth: FaceMeasurement<number>;
  faceLengthToCheekWidth: FaceMeasurement<number>;
  upperThirdRatio: FaceMeasurement<number>;
  middleThirdRatio: FaceMeasurement<number>;
  lowerThirdRatio: FaceMeasurement<number>;
  foreheadWidthToCheekWidth: FaceMeasurement<number>;
  templeWidthToCheekWidth: FaceMeasurement<number>;
  jawWidthToCheekWidth: FaceMeasurement<number>;
  chinWidthToCheekWidth: FaceMeasurement<number>;
  cheekToJawRatio: FaceMeasurement<number>;
  cheekDominance: FaceMeasurement<number>;
  jawlineLengthRatio: FaceMeasurement<number>;
  jawAngleDeg: FaceMeasurement<number>;
  jawWidthScore: FaceMeasurement<number>;
  jawAngleScore: FaceMeasurement<number>;
  jawSoftness: FaceMeasurement<number>;
  chinPointedness: FaceMeasurement<number>;
  contourRoundness: FaceMeasurement<number>;
  foreheadDominance: FaceMeasurement<number>;
  lowerFaceWeight: FaceMeasurement<number>;
  contourAsymmetry: FaceMeasurement<number>;
};

export type FaceProfileEyesAndBrows = {
  leftEyeAspectRatio: FaceMeasurement<number>;
  rightEyeAspectRatio: FaceMeasurement<number>;
  interEyeDistanceRatio: FaceMeasurement<number>;
  leftEyeCanthalTiltDeg: FaceMeasurement<number>;
  rightEyeCanthalTiltDeg: FaceMeasurement<number>;
  leftBrowEyeDistanceRatio: FaceMeasurement<number>;
  rightBrowEyeDistanceRatio: FaceMeasurement<number>;
  leftBrowTiltDeg: FaceMeasurement<number>;
  rightBrowTiltDeg: FaceMeasurement<number>;
  eyeAsymmetry: FaceMeasurement<number>;
  browAsymmetry: FaceMeasurement<number>;
};

export type FaceProfileNose = {
  noseLengthRatio: FaceMeasurement<number>;
  noseWidthRatio: FaceMeasurement<number>;
  noseToMidfaceRatio: FaceMeasurement<number>;
  noseTipToMouthRatio: FaceMeasurement<number>;
  centerlineAsymmetry: FaceMeasurement<number>;
};

export type FaceProfileMouth = {
  lipFullnessRatio: FaceMeasurement<number>;
  mouthWidthRatio: FaceMeasurement<number>;
  upperToLowerLipRatio: FaceMeasurement<number>;
  leftCornerTiltDeg: FaceMeasurement<number>;
  rightCornerTiltDeg: FaceMeasurement<number>;
  mouthAsymmetry: FaceMeasurement<number>;
};

export type FaceShapeNumericFeature =
  | 'faceLengthToWidth'
  | 'faceLengthToCheekWidth'
  | 'foreheadWidthToCheekWidth'
  | 'templeWidthToCheekWidth'
  | 'jawWidthToCheekWidth'
  | 'chinWidthToCheekWidth'
  | 'jawAngleDeg'
  | 'jawSoftness'
  | 'chinPointedness'
  | 'contourRoundness'
  | 'cheekDominance'
  | 'jawWidthScore'
  | 'jawAngleScore'
  | 'foreheadDominance'
  | 'lowerFaceWeight'
  | 'contourAsymmetry';

export type FaceShapeRuleFeatures = Record<FaceShapeNumericFeature, number | null> & {
  confidenceByFeature: Partial<Record<FaceShapeNumericFeature, number>>;
};

export type FaceShapeRuleFeatureSummary = {
  faceLengthToCheekWidth: number | null;
  foreheadWidthToCheekWidth: number | null;
  templeWidthToCheekWidth: number | null;
  jawWidthToCheekWidth: number | null;
  chinWidthToCheekWidth: number | null;
  cheekDominance: number | null;
  jawWidthScore: number | null;
  jawAngleScore: number | null;
  chinPointedness: number | null;
  contourRoundness: number | null;
  foreheadDominance: number | null;
  lowerFaceWeight: number | null;
  frontalConfidence: number;
  landmarkConfidence: number;
  hairlineConfidence: number;
  faceLengthToWidth?: number | null;
  jawAngleDeg?: number | null;
  jawSoftness?: number | null;
  contourAsymmetry?: number | null;
};

export type FaceShapeRuleResult = {
  status: 'ready' | 'mixed' | 'blocked';
  dominantShape: FaceShapeLabel | null;
  faceShapeScores: Record<FaceShapeLabel, number>;
  top2: Array<{shape: FaceShapeLabel; score: number}>;
  confidenceGap: number | null;
  overallConfidence: number;
  classifierType: 'rule_v1';
  classifierVersion: string;
  explanationTraits: string[];
  ruleFeatures: FaceShapeRuleFeatureSummary;
  warnings: string[];
};

export type BeautyCoreFeatures = {
  facialContrast: {
    overall: string;
    eyeSkinContrast: number | null;
    browSkinContrast: number | null;
    lipSkinContrast: number | null;
  };
  skinEvenness: {
    toneUniformity: number | null;
    redness: number | null;
    yellowHue: number | null;
  };
  faceBalance: {
    faceLengthWidthRatio: number | null;
    midfaceLength: string;
    lowerFaceLength: string;
    jawSoftness: number | null;
    cheekboneToJawRatio: number | null;
  };
  eyesAndBrows: {
    eyeAspectRatio: number | null;
    eyeSpacing: string;
    eyeTilt: string;
    browEyeDistance: string;
  };
  nose: {
    noseLengthRatio: number | null;
    noseWidthRatio: number | null;
    noseMidfaceRatio: number | null;
    noseTipMouthDistanceRatio: number | null;
  };
  mouth: {
    lipFullness: string;
    mouthWidthRatio: number | null;
    upperLowerLipRatio: number | null;
    mouthCornerTilt: string;
  };
  quality: {
    isFrontal: boolean | 'unavailable';
    neutralExpression: boolean | 'unavailable';
    lightingQuality: number | null;
    confidence: number;
  };
};

export type FaceVerticalThirdsSummary = {
  status: FaceProfileStatus;
  confidence: number | null;
  displayRatio: {lower: number; middle: number; upper: number | null};
  dominantPart: 'upper' | 'middle' | 'lower' | 'balanced' | 'unknown' | null;
  hairline: {confidence: number | null; provider: string | null};
  summary: string;
};

export type FaceProfileResult = {
  schemaVersion: typeof FACE_PROFILE_SCHEMA_VERSION;
  status: FaceProfileStatus;
  statusReason: string | null;
  captureId: string;
  createdAt: string;
  quality: FaceProfileQuality;
  color: FaceProfileColor;
  faceBalance: FaceProfileBalance;
  eyesAndBrows: FaceProfileEyesAndBrows;
  nose: FaceProfileNose;
  mouth: FaceProfileMouth;
  faceShape: FaceShapeRuleResult;
  beautyCoreFeatures: BeautyCoreFeatures;
  existingAnalysis: {
    verticalThirds: FaceVerticalThirdsSummary | null;
    personalColor: PersonalColorSummary | null;
  };
  warnings: string[];
  provenance: {
    landmarkProvider: 'unity_homuler_mediapipe';
    landmarkCount: number;
    landmarkIndexVersion: string;
    classifierVersion: string;
    pixelAnalyzerVersion: string;
    trueDepthUsed: boolean;
    trainingUseAllowed: false;
  };
};
