export type LocalBeautyResultConfidencePresentationInput = {
  faceImageConfidence: number;
  personalColorConfidence: number;
};

export type LocalBeautyResultConfidenceItem = {
  label: string;
  value: string;
};

export type LocalBeautyResultConfidencePresentation = {
  faceImage: LocalBeautyResultConfidenceItem;
  personalColor: LocalBeautyResultConfidenceItem;
};

function formatConfidenceValue(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function getLocalBeautyResultConfidencePresentation({
  faceImageConfidence,
  personalColorConfidence,
}: LocalBeautyResultConfidencePresentationInput): LocalBeautyResultConfidencePresentation {
  return {
    faceImage: {
      label: '이미지 타입 답변 일치도',
      value: formatConfidenceValue(faceImageConfidence),
    },
    personalColor: {
      label: '퍼스널 컬러 답변 일치도',
      value: formatConfidenceValue(personalColorConfidence),
    },
  };
}
