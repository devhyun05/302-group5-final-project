import type { ImageSourcePropType } from 'react-native';
import type {FaceAnalysisProfileSummary} from '../services/faceAnalysisProfileMapping';
import type {FaceProfileResult} from './faceProfile';

export type {FaceAnalysisProfileSummary} from '../services/faceAnalysisProfileMapping';

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

export interface FaceAnalysisReport {
  id: string;
  title: string;
  reportTitle: string;
  analyzedAt: string;
  imageSource: ImageSourcePropType;
  environmentLabel: string;
  personalColor: string;
  faceShape: string;
  faceProfile?: FaceProfileResult;
  faceProfileSummary?: FaceAnalysisProfileSummary;
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
