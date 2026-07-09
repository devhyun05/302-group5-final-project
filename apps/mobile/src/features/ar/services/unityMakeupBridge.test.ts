import {
  UNITY_MAKEUP_BRIDGE_TARGET,
  UNITY_MAKEUP_LAYER_ORDER,
  createUnityMakeupRecipeBatch,
  createUnityMakeupRecipeBatchFromARFilterSelections,
  getUnityGeneratedMaskBridgeRoute,
  getUnityMakeupLayerRegionsForMakeupArea,
} from './unityMakeupBridge';
import {
  UNITY_FACE_IMAGE_ANALYSIS_SCHEMA_VERSION,
  buildUnityFaceImageAnalysisRequest,
  isUnityFaceImageAnalysisEvent,
} from '../../../shared/contracts/unityFaceAnalysis';
import {mapUnityFaceImageAnalysisToNativeResult} from '../../face-ratio/services/unityFaceImageAnalyzer';
import type {MakeupFilter} from '../../../shared/types/makeupGuide';

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
expectEqual(
  UNITY_MAKEUP_BRIDGE_TARGET.faceImageAnalysisMethod,
  'AnalyzeFaceImageJson',
  'Unity face image analysis method',
);
expectEqual(
  UNITY_MAKEUP_BRIDGE_TARGET.arSessionPauseMethod,
  'SetARSessionPausedJson',
  'Unity AR session pause method',
);

const unityFaceAnalysisRequest = buildUnityFaceImageAnalysisRequest({
  cameraFacing: 'back',
  captureId: 'capture-back-1',
  imageUri: 'file:///tmp/back-camera.jpg',
  requestedAtMs: 3000,
  sessionId: 'session-1',
});

expectEqual(
  unityFaceAnalysisRequest.requestId,
  'unity-face-analysis-3000',
  'Unity face analysis default request id',
);
expectEqual(
  unityFaceAnalysisRequest.cameraFacing,
  'back',
  'Unity face analysis preserves rear camera facing',
);
expectEqual(
  unityFaceAnalysisRequest.privacy.localOnly,
  true,
  'Unity face analysis stays local',
);
expectEqual(
  unityFaceAnalysisRequest.privacy.offDeviceUpload,
  false,
  'Unity face analysis avoids off-device upload',
);
expectEqual(
  unityFaceAnalysisRequest.rotationDegrees,
  0,
  'Unity face analysis defaults to upright image rotation',
);

const unityFaceAnalysisEvent = {
  faceCount: 1,
  debugPoints: {
    idx234: {index: 234, normalized: true, x: 0.25, y: 0.48},
    idx454: {index: 454, normalized: true, x: 0.75, y: 0.48},
  },
  imageHeight: 1920,
  imageWidth: 1440,
  keypoints: {
    glabella: {index: 9, normalized: true, x: 0.5, y: 0.32},
    hApprox: {index: 10, normalized: true, x: 0.5, y: 0.18},
    menton: {index: 152, normalized: true, x: 0.5, y: 0.82},
    subnasale: {index: 2, normalized: true, x: 0.5, y: 0.52},
  },
  landmarks: [
    {
      index: 1,
      normalized: true,
      x: 0.5,
      y: 0.25,
    },
  ],
  requestId: unityFaceAnalysisRequest.requestId,
  schemaVersion: UNITY_FACE_IMAGE_ANALYSIS_SCHEMA_VERSION,
  status: 'ok',
  type: 'unity_face_image_analysis',
} as const;

expectEqual(
  isUnityFaceImageAnalysisEvent(unityFaceAnalysisEvent),
  true,
  'Unity face analysis event guard accepts valid event',
);
expectEqual(
  isUnityFaceImageAnalysisEvent({
    ...unityFaceAnalysisEvent,
    status: 'done',
  }),
  false,
  'Unity face analysis event guard rejects unknown status',
);

const mappedUnityFaceRatioResult = mapUnityFaceImageAnalysisToNativeResult(
  unityFaceAnalysisEvent,
);

expectEqual(mappedUnityFaceRatioResult.status, 'ok', 'Unity face ratio status mapping');
expectEqual(
  mappedUnityFaceRatioResult.keypoints?.menton?.y,
  0.82,
  'Unity menton keypoint is mapped for vertical thirds',
);
expectEqual(
  mappedUnityFaceRatioResult.debugPoints?.idx454?.x,
  0.75,
  'Unity cheek debug point is mapped for face length',
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
