import {getLocalBeautyResultConfidencePresentation} from './localBeautyResultConfidencePresentation';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const presentation = getLocalBeautyResultConfidencePresentation({
  faceImageConfidence: 0.72,
  personalColorConfidence: 0.84,
});

expectEqual(
  presentation.personalColor.label,
  '퍼스널 컬러 답변 일치도',
  'personal color confidence label',
);
expectEqual(
  presentation.personalColor.value,
  '84%',
  'personal color confidence value',
);
expectEqual(
  presentation.faceImage.label,
  '이미지 타입 답변 일치도',
  'face image confidence label',
);
expectEqual(
  presentation.faceImage.value,
  '72%',
  'face image confidence value',
);
