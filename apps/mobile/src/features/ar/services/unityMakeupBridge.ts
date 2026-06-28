import {NativeModules} from 'react-native';

export const UNITY_MAKEUP_BRIDGE_TARGET = {
  gameObject: 'RNBridge',
  applyRecipeMethod: 'ApplyRecipeJson',
} as const;

export type UnityMakeupRegion = 'lip' | 'cheek' | 'brow';

export type UnityMakeupRegionPreset = {
  branchSource: string;
  color: string;
  finish: string;
  label: string;
  maskTextureId: string;
  opacity: number;
  region: UnityMakeupRegion;
  texture: string;
};

export type UnityMakeupLayer = UnityMakeupRegionPreset & {
  blendMode: 'normal' | 'screen';
  coverage: number;
  enabled: boolean;
  feather: number;
  id: string;
  intensity: number;
  rendererMode: 'smooth-region-mask';
  textureMode: 'sample';
};

export type UnityMakeupRecipeBatch = {
  activeRegions: string;
  enabledLayerCount: number;
  layerCount: number;
  layers: UnityMakeupLayer[];
  lookId: 'lip_cheek_brow_region_preview';
  recipeBatchId: string;
  rendererMode: 'smooth-region-mask';
  sentAtMs: number;
  version: 1;
};

export const UNITY_MAKEUP_REGION_PRESETS: Record<
  UnityMakeupRegion,
  UnityMakeupRegionPreset
> = {
  lip: {
    branchSource: 'COMETIC-EXPRESSION-ENINEERING',
    color: '#D94B74',
    finish: 'gradient-lip',
    label: 'Lip',
    maskTextureId: 'lip-drawn-style-atlas-v1',
    opacity: 0.62,
    region: 'lip',
    texture: 'gradient_lip',
  },
  cheek: {
    branchSource: 'blush-mask@c0c518d',
    color: '#E67B5F',
    finish: 'powder-blush',
    label: 'Cheek',
    maskTextureId: 'cheek-daily-mask-v1',
    opacity: 0.46,
    region: 'cheek',
    texture: 'soft_blush',
  },
  brow: {
    branchSource: 'feature/brow-0626',
    color: '#4A342B',
    finish: 'soft-powder-brow',
    label: 'Brow',
    maskTextureId: 'brow-png-dailyflat-sharp-v1',
    opacity: 0.58,
    region: 'brow',
    texture: 'natural_brow',
  },
};

const REGION_ORDER: UnityMakeupRegion[] = ['lip', 'cheek', 'brow'];

export function createUnityMakeupRecipeBatch(
  activeRegion: UnityMakeupRegion,
  sentAtMs = Date.now(),
): UnityMakeupRecipeBatch {
  const layers = REGION_ORDER.map(region => {
    const preset = UNITY_MAKEUP_REGION_PRESETS[region];
    const enabled = region === activeRegion;

    return {
      ...preset,
      blendMode: 'normal',
      coverage: region === 'brow' ? 0.74 : 0.64,
      enabled,
      feather: region === 'brow' ? 0.42 : 0.32,
      id: `${region}-${preset.maskTextureId}`,
      intensity: enabled ? 1 : 0,
      rendererMode: 'smooth-region-mask',
      textureMode: 'sample',
    } satisfies UnityMakeupLayer;
  });

  return {
    activeRegions: activeRegion,
    enabledLayerCount: layers.filter(layer => layer.enabled).length,
    layerCount: layers.length,
    layers,
    lookId: 'lip_cheek_brow_region_preview',
    recipeBatchId: `makeup-region-${activeRegion}-${sentAtMs}`,
    rendererMode: 'smooth-region-mask',
    sentAtMs,
    version: 1,
  };
}

export function serializeUnityMakeupRecipeBatch(
  recipeBatch: UnityMakeupRecipeBatch,
): string {
  return JSON.stringify(recipeBatch);
}

export function postUnityMakeupRecipe(recipeBatch: UnityMakeupRecipeBatch): boolean {
  const payload = serializeUnityMakeupRecipeBatch(recipeBatch);
  const nativeBridge = NativeModules.UnityMakeupBridge as
    | {postMessage?: (gameObject: string, method: string, payload: string) => void}
    | undefined;

  if (nativeBridge?.postMessage) {
    nativeBridge.postMessage(
      UNITY_MAKEUP_BRIDGE_TARGET.gameObject,
      UNITY_MAKEUP_BRIDGE_TARGET.applyRecipeMethod,
      payload,
    );

    return true;
  }

  console.info('[aura:unity] makeup-recipe:fallback-log', {
    activeRegions: recipeBatch.activeRegions,
    target: UNITY_MAKEUP_BRIDGE_TARGET,
  });

  return false;
}
