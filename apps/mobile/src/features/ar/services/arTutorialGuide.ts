import {
  getUnityMakeupLayerRegionsForARFilterSelection,
  shouldEnableUnityMakeupSelection,
  type UnityMakeupLayerRegion,
  type UnityMakeupARFilterSelection,
} from './unityMakeupBridge';

export type ARTutorialGuideRegion =
  | 'lips'
  | 'brows'
  | 'eyeliner'
  | 'blush';

export type ARTutorialGuideStep = {
  color: string;
  id: ARTutorialGuideRegion;
  label: string;
  region: ARTutorialGuideRegion;
};

export type ARTutorialGuideConfig = {
  dash: boolean;
  midline: boolean;
  opacity: number;
  pairs: boolean;
  pulse: boolean;
  selectedStepId: 'all' | ARTutorialGuideRegion;
};

export type ARTutorialGuidePayload = {
  blush: boolean;
  brows: boolean;
  dash: boolean;
  enabled: boolean;
  eyeliner: boolean;
  lips: boolean;
  midline: boolean;
  opacity: number;
  pairs: boolean;
  pulse: boolean;
};

const GUIDE_STEP_BY_REGION: Partial<
  Record<UnityMakeupLayerRegion, ARTutorialGuideStep>
> = {
  brow: {color: '#9E704D', id: 'brows', label: '브로우', region: 'brows'},
  blush: {color: '#FF8C73', id: 'blush', label: '치크', region: 'blush'},
  eyeliner: {color: '#3A3550', id: 'eyeliner', label: '아이라인', region: 'eyeliner'},
  lip: {color: '#FF598C', id: 'lips', label: '립', region: 'lips'},
};

export const DEFAULT_AR_TUTORIAL_GUIDE_CONFIG: ARTutorialGuideConfig = {
  dash: true,
  midline: false,
  opacity: 0.86,
  pairs: false,
  pulse: true,
  selectedStepId: 'all',
};

export function getARTutorialGuideSteps(
  selections: readonly UnityMakeupARFilterSelection[],
  excludeRegions: readonly UnityMakeupLayerRegion[] = [],
): readonly ARTutorialGuideStep[] {
  const stepById = new Map<ARTutorialGuideRegion, ARTutorialGuideStep>();
  const excludedRegionSet = new Set(excludeRegions);

  selections.forEach(selection => {
    if (!shouldEnableUnityMakeupSelection(selection)) {
      return;
    }

    getUnityMakeupLayerRegionsForARFilterSelection(selection).forEach(region => {
      if (excludedRegionSet.has(region)) {
        return;
      }
      const step = GUIDE_STEP_BY_REGION[region];
      if (!step) {
        return;
      }
      if (!stepById.has(step.id)) {
        stepById.set(step.id, step);
      }
    });
  });

  return [...stepById.values()];
}

export function buildARTutorialGuidePayload({
  config,
  enabled,
  steps,
}: {
  config: ARTutorialGuideConfig;
  enabled: boolean;
  steps: readonly ARTutorialGuideStep[];
}): ARTutorialGuidePayload {
  const availableRegions = new Set(steps.map(step => step.region));
  const selectedRegion = availableRegions.has(
    config.selectedStepId as ARTutorialGuideRegion,
  )
    ? config.selectedStepId as ARTutorialGuideRegion
    : null;
  const isRegionVisible = (region: ARTutorialGuideRegion) =>
    selectedRegion ? selectedRegion === region : availableRegions.has(region);
  const hasVisibleGuide = availableRegions.size > 0 || config.midline || config.pairs;

  return {
    blush: enabled && isRegionVisible('blush'),
    brows: enabled && isRegionVisible('brows'),
    dash: config.dash,
    enabled: enabled && hasVisibleGuide,
    eyeliner: enabled && isRegionVisible('eyeliner'),
    lips: enabled && isRegionVisible('lips'),
    midline: enabled && config.midline,
    opacity: Math.max(0, Math.min(1, config.opacity)),
    pairs: enabled && config.pairs,
    pulse: config.pulse,
  };
}
