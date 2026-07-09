import type { ImageSourcePropType } from 'react-native';

export interface FaceAnalysisMakeupGuideline {
  brow: string;
  blush: string;
  highlight: string;
  eyeshadow: string;
  eyeliner: string;
  lip: string;
}

export interface FaceAnalysisMakeupCard {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  imageSource: ImageSourcePropType;
  imageStatus?: 'pending' | 'ready' | 'failed';
  tags: string[];
}

export type FaceAnalysisCameraAnalysisContextSchemaVersion =
  'aura-camera-analysis-context-v1';

export interface FaceAnalysisCameraVerticalThirdsContext {
  source: 'on_device';
  confidence: number | null;
  displayRatio: {
    lower: number;
    middle: number;
    upper: number | null;
  };
  dominantPart: string | null;
  hairline: {
    confidence: number | null;
    provider: string | null;
  };
  measurement?: {
    mode: string;
    semanticMatteAvailable: boolean;
    semanticMatteRequested: boolean;
    source: string;
    trueDepthCorrectionApplied: boolean;
    warnings: string[];
  } | null;
  status: string;
  summary: string;
}

export interface FaceAnalysisCameraPersonalColorContext {
  source: 'on_device';
  confidence: number | null;
  isMixed: boolean | null;
  label: string | null;
  measurementConfidence: number | null;
  season: string | null;
  secondaryTone: string | null;
  status: string;
  tone: string | null;
  warnings: string[];
}

export interface FaceAnalysisCameraAnalysisContext {
  schemaVersion: FaceAnalysisCameraAnalysisContextSchemaVersion;
  captureId: string | null;
  reportId?: string | null;
  faceVerticalThirds?: FaceAnalysisCameraVerticalThirdsContext | null;
  personalColor?: FaceAnalysisCameraPersonalColorContext | null;
}

export interface FaceAnalysisReport {
  id: string;
  title: string;
  reportTitle: string;
  analyzedAt: string;
  captureId?: string | null;
  cameraAnalysisContext?: FaceAnalysisCameraAnalysisContext | null;
  imageSource: ImageSourcePropType;
  environmentLabel: string;
  personalColor: string;
  faceShape: string;
  skinType: string;
  toneSummary: string;
  recommendedMood: string;
  tags: string[];
  summary: string;
  shortSummary: string;
  skinAnalysisSummary: string;
  baseMakeupGuide: string;
  makeupGuideline: FaceAnalysisMakeupGuideline;
  recommendedMakeups: FaceAnalysisMakeupCard[];
  avoidedMakeups: FaceAnalysisMakeupCard[];
}
