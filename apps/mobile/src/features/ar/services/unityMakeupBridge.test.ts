import {
  FACE_LANDMARKS_EVENT_TYPE,
  FACE_LANDMARKS_STILL_REQUEST_TYPE,
  UNITY_MAKEUP_BRIDGE_TARGET,
  UNITY_MAKEUP_LAYER_ORDER,
  UNITY_AR_PHOTO_CAPTURE_EVENT_TYPE,
  UNITY_STILL_FACE_LANDMARKS_TARGET,
  UNITY_TUTORIAL_GUIDE_TARGET,
  buildAnalyzeFaceLandmarksStillRequest,
  createUnityMakeupRecipeBatch,
  createUnityMakeupRecipeBatchFromARFilterSelections,
  getUnityGeneratedMaskBridgeRoute,
  getUnityMakeupLayerRegionsForMakeupArea,
  getUnityMakeupRecipeExcludedRegions,
  parseFaceLandmarksMessage,
} from './unityMakeupBridge';
import type {MakeupFilter} from '../../../shared/types/makeupGuide';
import type {
  FilterShapeAreaPreset,
  FilterShapePreset,
} from './filterCustomizationService';
import {
  ORIGINAL_OPTION_CARD_ID,
  getARFilterSelectionAfterOriginalCardPress,
} from './arFilterOptionRules';
import {
  buildARTutorialGuidePayload,
  DEFAULT_AR_TUTORIAL_GUIDE_CONFIG,
  getARTutorialGuideSteps,
} from './arTutorialGuide';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const mockFilter: MakeupFilter = {
  id: 'full-face-contract',
  imageSource: 1,
  categoryId: 'recommended',
  title: '맞춤 룩',
  subtitle: '4부위',
  intensityLabel: '기본',
  makeupAreas: ['all'],
  colorOptions: [{id: 'rose', label: '로즈', hex: '#C76B74'}],
  typeOptions: [{id: 'liner', label: '라이너'}],
  textureOptions: [{id: 'matte', label: '매트'}],
};

expectEqual(
  UNITY_MAKEUP_LAYER_ORDER.join(','),
  'foundation,lip,blush,brow,eyeliner,lens',
  'Unity makeup layer order',
);
expectEqual(
  getUnityMakeupLayerRegionsForMakeupArea('lens').join(','),
  'lens',
  'lens area alias',
);
expectEqual(
  getUnityMakeupLayerRegionsForMakeupArea('cheek').join(','),
  'blush',
  'cheek area alias',
);
expectEqual(
  getUnityMakeupLayerRegionsForMakeupArea('eye').join(','),
  'eyeliner',
  'eye area alias',
);
expectEqual(
  UNITY_TUTORIAL_GUIDE_TARGET.gameObject,
  'AuraTutorialGuide',
  'tutorial guide Unity receiver',
);
expectEqual(
  UNITY_TUTORIAL_GUIDE_TARGET.applyMethod,
  'ApplyJson',
  'tutorial guide Unity method',
);
expectEqual(
  UNITY_TUTORIAL_GUIDE_TARGET.capturePhotoMethod,
  'CapturePhoto',
  'AR photo capture Unity method',
);
expectEqual(
  UNITY_AR_PHOTO_CAPTURE_EVENT_TYPE,
  'ar_photo_captured',
  'AR photo capture Unity event',
);

const generatedLipRoute = getUnityGeneratedMaskBridgeRoute('lip');
const generatedBrowRoute = getUnityGeneratedMaskBridgeRoute('brow');

expectEqual(
  generatedLipRoute.method,
  UNITY_MAKEUP_BRIDGE_TARGET.applyGeneratedLipMaskMethod,
  'generated lip Unity method',
);
expectEqual(
  generatedLipRoute.eventName,
  'generated_lip_mask_apply',
  'generated lip event name',
);
expectEqual(
  generatedLipRoute.retryKeyPrefix,
  'generated-lip-mask',
  'generated lip retry prefix',
);
expectEqual(
  generatedBrowRoute.method,
  UNITY_MAKEUP_BRIDGE_TARGET.applyGeneratedBrowMaskMethod,
  'generated brow Unity method',
);
expectEqual(
  generatedBrowRoute.eventName,
  'generated_brow_mask_apply',
  'generated brow event name',
);
expectEqual(
  generatedBrowRoute.retryKeyPrefix,
  'generated-brow-mask',
  'generated brow retry prefix',
);

const singleRegionRecipe = createUnityMakeupRecipeBatch('eyeliner', 1000);

expectEqual(singleRegionRecipe.version, 2, 'single region recipe version');
expectEqual(singleRegionRecipe.layerCount, 5, 'single region recipe layer count');
expectEqual(singleRegionRecipe.enabledLayerCount, 1, 'single region enabled count');
expectEqual(singleRegionRecipe.activeRegions, 'eyeliner', 'single region active summary');
expectEqual(
  singleRegionRecipe.layers.map(layer => layer.region).join(','),
  'foundation,lip,blush,brow,eyeliner',
  'single region recipe keeps full-layer shape',
);
expectEqual(
  singleRegionRecipe.layers.find(layer => layer.region === 'eyeliner')?.maskTextureId,
  'e7-eyeliner-minimal-safe-uv-v0',
  'eyeliner recipe mask id',
);

const allRegionRecipe = createUnityMakeupRecipeBatchFromARFilterSelections(
  [
    {
      selectedColor: {hex: '#C76B74', label: '로즈'},
      selectedColorId: 'rose',
      selectedMakeupArea: 'all',
      selectedMakeupFilter: mockFilter,
      selectedPointMakeupLookId: 'custom',
      selectedShapeId: 'balanced',
      selectedTextureId: 'matte',
      selectedTotalMakeupLookId: 'custom',
      selectedTypeId: 'liner',
    },
  ],
  2000,
);

expectEqual(allRegionRecipe.layerCount, 5, 'all region recipe layer count');
// 'all' enables every region EXCEPT lens (lens is opt-in via its own tab), so
// 5 of the 6 emitted layers are active.
expectEqual(allRegionRecipe.enabledLayerCount, 5, 'all region enabled count');
expectEqual(
  allRegionRecipe.activeRegions,
  'foundation,lip,blush,brow,eyeliner',
  'all region active summary',
);
expectEqual(
  allRegionRecipe.layers.find(layer => layer.region === 'brow')?.maskTextureId,
  'brow-png-natural-hair-v1',
  'brow recipe mask id',
);
expectEqual(
  allRegionRecipe.layers.find(layer => layer.region === 'lip')?.color,
  '#CA6574',
  'total look derives a coordinated lip color from its representative swatch',
);

const subsetTotalFilter: MakeupFilter = {
  ...mockFilter,
  id: 'eye-cheek-lip-contract',
  makeupAreas: ['eye', 'cheek', 'lip'],
};
const subsetTotalRecipe = createUnityMakeupRecipeBatchFromARFilterSelections(
  [
    {
      selectedColor: {hex: '#F0B7A2', label: '샴페인 코랄'},
      selectedColorId: 'champagne-coral',
      selectedMakeupArea: 'all',
      selectedMakeupFilter: subsetTotalFilter,
      selectedPointMakeupLookId: 'custom',
      selectedShapeId: 'soft-focus',
      selectedTextureId: 'pearl-glow',
      selectedTotalMakeupLookId: subsetTotalFilter.id,
      selectedTypeId: 'pearl-shadow',
    },
  ],
  2100,
);
expectEqual(
  subsetTotalRecipe.activeRegions,
  'lip,blush,eyeliner',
  'total look only enables regions authored by the selected filter',
);
expectEqual(
  subsetTotalRecipe.layers.find(layer => layer.region === 'lip')?.color ===
    allRegionRecipe.layers.find(layer => layer.region === 'lip')?.color,
  false,
  'different total-look swatches produce different coordinated palettes',
);
const subsetGuideSteps = getARTutorialGuideSteps([
  {
    selectedColor: {hex: '#F0B7A2', label: '샴페인 코랄'},
    selectedColorId: 'champagne-coral',
    selectedMakeupArea: 'all',
    selectedMakeupFilter: subsetTotalFilter,
    selectedPointMakeupLookId: 'custom',
    selectedShapeId: 'soft-focus',
    selectedTextureId: 'pearl-glow',
    selectedTotalMakeupLookId: subsetTotalFilter.id,
    selectedTypeId: 'pearl-shadow',
  },
]);
expectEqual(
  subsetGuideSteps.map(step => step.id).join(','),
  'lips,blush,eyeliner',
  'guide only includes regions authored by the selected total look',
);

const lipSelection = {
  selectedColor: {hex: '#C76B74', label: '로즈'},
  selectedColorId: 'rose',
  selectedMakeupArea: 'lip' as const,
  selectedMakeupFilter: mockFilter,
  selectedPointMakeupLookId: 'custom-lip',
  selectedShapeId: 'balanced',
  selectedTextureId: 'matte',
  selectedTotalMakeupLookId: null,
  selectedTypeId: 'liner',
};
const lipFitPreset: FilterShapePreset = {
  adjustments: {
    horizontal: {label: '좌우', max: 24, min: -24, step: 2, unit: 'px', value: 12},
    rotation: {label: '각도', max: 15, min: -15, step: 1, unit: '°', value: 8},
    scale: {label: '크기', max: 20, min: -20, step: 2, unit: '%', value: 10},
    vertical: {label: '상하', max: 24, min: -24, step: 2, unit: 'px', value: -12},
  },
  selectedMakeupArea: 'lip',
  shapePoints: [
    {
      id: 'lip-top',
      offset: {x: 2, y: -4},
      position: {x: 50, y: 68},
      resolvedPosition: {x: 52, y: 64},
    },
  ],
};
const fittedLipRecipe = createUnityMakeupRecipeBatchFromARFilterSelections(
  [lipSelection],
  2200,
  'off',
  [],
  lipFitPreset,
);
const fittedLipLayer = fittedLipRecipe.layers.find(layer => layer.region === 'lip');
expectEqual(fittedLipLayer?.maskOffsetX, 0.05, 'fit preset maps horizontal position to recipe');
expectEqual(fittedLipLayer?.maskOffsetY, 0.07, 'fit preset maps vertical position to recipe');
expectEqual(fittedLipLayer?.maskScale, 0.11, 'fit preset maps scale to recipe');
expectEqual(fittedLipLayer?.maskRotation, 8, 'fit preset maps rotation to recipe');
const browSelection = {
  ...lipSelection,
  selectedMakeupArea: 'brow' as const,
  selectedPointMakeupLookId: 'custom-brow',
};
const browAreaPreset: FilterShapeAreaPreset = {
  adjustments: {
    horizontal: {label: '좌우', max: 24, min: -24, step: 2, unit: 'px', value: -12},
    rotation: {label: '각도', max: 15, min: -15, step: 1, unit: '°', value: -6},
    scale: {label: '크기', max: 20, min: -20, step: 2, unit: '%', value: -10},
    vertical: {label: '상하', max: 24, min: -24, step: 2, unit: 'px', value: 12},
  },
  shapePoints: [
    {
      id: 'left-brow',
      offset: {x: -1, y: 3},
      position: {x: 38, y: 31},
      resolvedPosition: {x: 37, y: 34},
    },
  ],
};
const multiAreaFitPreset: FilterShapePreset = {
  ...lipFitPreset,
  adjustments: browAreaPreset.adjustments,
  areaPresets: {
    brow: browAreaPreset,
    lip: {
      adjustments: lipFitPreset.adjustments,
      shapePoints: lipFitPreset.shapePoints,
    },
  },
  selectedMakeupArea: 'brow',
  shapePoints: browAreaPreset.shapePoints,
};
const multiAreaFitRecipe = createUnityMakeupRecipeBatchFromARFilterSelections(
  [lipSelection, browSelection],
  2250,
  'off',
  [],
  multiAreaFitPreset,
);
const multiAreaLipLayer = multiAreaFitRecipe.layers.find(layer => layer.region === 'lip');
const multiAreaBrowLayer = multiAreaFitRecipe.layers.find(layer => layer.region === 'brow');
expectEqual(multiAreaLipLayer?.maskOffsetX, 0.05, 'multi-area fit preserves lip position');
expectEqual(multiAreaBrowLayer?.maskOffsetX, -0.04, 'multi-area fit keeps brow points separate');
expectEqual(multiAreaBrowLayer?.maskOffsetY, -0.06, 'multi-area fit preserves brow height');
expectEqual(multiAreaBrowLayer?.maskRotation, -6, 'multi-area fit preserves brow rotation');
const tutorialSteps = getARTutorialGuideSteps([lipSelection, browSelection]);

expectEqual(tutorialSteps.map(step => step.id).join(','), 'lips,brows', 'guide step order');

const allGuidePayload = buildARTutorialGuidePayload({
  config: DEFAULT_AR_TUTORIAL_GUIDE_CONFIG,
  enabled: true,
  steps: tutorialSteps,
});
expectEqual(allGuidePayload.enabled, true, 'guide enabled with selected makeup');
expectEqual(allGuidePayload.lips, true, 'all guide includes lip');
expectEqual(allGuidePayload.brows, true, 'all guide includes brow');
expectEqual(allGuidePayload.blush, false, 'all guide masks unavailable cheek');

const lipOnlyGuidePayload = buildARTutorialGuidePayload({
  config: {...DEFAULT_AR_TUTORIAL_GUIDE_CONFIG, selectedStepId: 'lips'},
  enabled: true,
  steps: tutorialSteps,
});
expectEqual(lipOnlyGuidePayload.lips, true, 'single guide keeps selected region');
expectEqual(lipOnlyGuidePayload.brows, false, 'single guide hides other regions');

const clearedLipSelectionState = getARFilterSelectionAfterOriginalCardPress({
  selectedMakeupArea: 'lip',
  selectedMakeupOptionGroup: 'makeupLook',
  selectionState: {
    hasUnsavedMakeupChanges: true,
    selectedColorId: lipSelection.selectedColorId,
    selectedPointMakeupLookId: lipSelection.selectedPointMakeupLookId,
    selectedShapeId: lipSelection.selectedShapeId,
    selectedTextureId: lipSelection.selectedTextureId,
    selectedTotalMakeupLookId: lipSelection.selectedTotalMakeupLookId,
    selectedTypeId: lipSelection.selectedTypeId,
  },
});
expectEqual(
  clearedLipSelectionState.selectedPointMakeupLookId,
  ORIGINAL_OPTION_CARD_ID,
  'original point transition creates a clear tombstone',
);
const explicitlyClearedLipSelection = {
  ...lipSelection,
  ...clearedLipSelectionState,
};
expectEqual(
  getUnityMakeupRecipeExcludedRegions([explicitlyClearedLipSelection]).join(','),
  'lip',
  'explicit original point selection clears the total-look region below it',
);
const totalWithClearedLipSelections = [
  {
    selectedColor: {hex: '#C76B74', label: '로즈'},
    selectedColorId: 'rose',
    selectedMakeupArea: 'all' as const,
    selectedMakeupFilter: mockFilter,
    selectedPointMakeupLookId: 'custom',
    selectedShapeId: 'balanced',
    selectedTextureId: 'matte',
    selectedTotalMakeupLookId: mockFilter.id,
    selectedTypeId: 'liner',
  },
  explicitlyClearedLipSelection,
];
const totalWithClearedLipExclusions = getUnityMakeupRecipeExcludedRegions(
  totalWithClearedLipSelections,
);
expectEqual(
  getARTutorialGuideSteps(
    totalWithClearedLipSelections,
    totalWithClearedLipExclusions,
  ).map(step => step.id).join(','),
  'blush,brows,eyeliner',
  'guide removes a total-look region cleared by a point original tombstone',
);

// ── 퍼스널 컬러 정지영상 랜드마크 요청/응답 (homuler Track 1) ────────────────
const stillRequest = JSON.parse(
  buildAnalyzeFaceLandmarksStillRequest('file:///tmp/capture.jpg', 'pc-abc', 1),
);
expectEqual(stillRequest.type, FACE_LANDMARKS_STILL_REQUEST_TYPE, 'still request type');
expectEqual(stillRequest.requestId, 'pc-abc', 'still request id');
expectEqual(stillRequest.imagePath, 'file:///tmp/capture.jpg', 'still request imagePath');
expectEqual(stillRequest.maxFaces, 1, 'still request maxFaces');

const okLandmarks = parseFaceLandmarksMessage(
  JSON.stringify({
    type: FACE_LANDMARKS_EVENT_TYPE,
    requestId: 'pc-abc',
    status: 'ok',
    faceCount: 1,
    imageWidth: 1080,
    imageHeight: 1440,
    landmarks: [
      {i: 0, x: 0.5, y: 0.42, z: -0.03},
      {i: 1, x: 0.51, y: 0.44, z: -0.02},
      {i: 2, x: 'bad', y: 0.5, z: 0}, // 비유한값 → 필터링
    ],
    pose: {pitchDeg: 1.2, yawDeg: -0.4, rollDeg: 0.8},
  }),
);
expectEqual(okLandmarks?.status, 'ok', 'landmarks status ok');
expectEqual(okLandmarks?.requestId, 'pc-abc', 'landmarks requestId');
expectEqual(okLandmarks?.faceCount, 1, 'landmarks faceCount');
expectEqual(okLandmarks?.imageWidth, 1080, 'landmarks imageWidth');
expectEqual(okLandmarks?.landmarks.length, 2, 'landmarks filtered count');
expectEqual(okLandmarks?.landmarks[0].x, 0.5, 'landmarks first x');
expectEqual(okLandmarks?.pose?.pitchDeg, 1.2, 'landmarks pose pitch');

// 다른 이벤트 타입(예: photoCaptured)은 무시(null)
const otherEvent = parseFaceLandmarksMessage(
  JSON.stringify({type: 'photoCaptured', path: 'file:///tmp/x.jpg'}),
);
expectEqual(otherEvent, null, 'non personal-color event ignored');

// 형식 깨진 JSON 은 null
expectEqual(
  parseFaceLandmarksMessage('{not-json'),
  null,
  'malformed message ignored',
);

// requestId 없는 랜드마크 이벤트는 null(상관 불가)
expectEqual(
  parseFaceLandmarksMessage(
    JSON.stringify({type: FACE_LANDMARKS_EVENT_TYPE, status: 'ok'}),
  ),
  null,
  'landmarks without requestId ignored',
);

// Unity 수신 타겟: StillFaceLandmarkService.cs 의 GameObject/메서드명과 계약
expectEqual(
  UNITY_STILL_FACE_LANDMARKS_TARGET.gameObject,
  'AuraStillFaceLandmarks',
  'still landmarks gameObject',
);
expectEqual(
  UNITY_STILL_FACE_LANDMARKS_TARGET.analyzeMethod,
  'AnalyzeStillJson',
  'still landmarks method',
);

// Unity SendFailure 형식(빈 landmarks + error, imageWidth/pose 없음)도 파싱
const failureEvent = parseFaceLandmarksMessage(
  JSON.stringify({
    type: FACE_LANDMARKS_EVENT_TYPE,
    requestId: 'pc-err',
    status: 'error',
    faceCount: 0,
    landmarks: [],
    error: 'mediapipe_package_unavailable',
  }),
);
expectEqual(failureEvent?.status, 'error', 'failure status parsed');
expectEqual(failureEvent?.error, 'mediapipe_package_unavailable', 'failure error field');
expectEqual(failureEvent?.imageWidth, 0, 'failure imageWidth defaults 0');
expectEqual(failureEvent?.pose, null, 'failure pose null');

// no_face 응답도 정상 파싱(호출측이 insufficient 처리)
const noFace = parseFaceLandmarksMessage(
  JSON.stringify({
    type: FACE_LANDMARKS_EVENT_TYPE,
    requestId: 'pc-def',
    status: 'no_face',
    faceCount: 0,
    landmarks: [],
  }),
);
expectEqual(noFace?.status, 'no_face', 'no_face status parsed');
expectEqual(noFace?.landmarks.length, 0, 'no_face empty landmarks');
expectEqual(noFace?.pose, null, 'no_face null pose');
