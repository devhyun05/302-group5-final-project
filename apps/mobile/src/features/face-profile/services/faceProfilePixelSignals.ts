import type {
  FaceMeasurement,
  FaceProfileColor,
} from '../../../shared/types/faceProfile';
import {combineSkinPatches} from '../../personal-color/services/personalColorCore/engine';
import {
  clamp,
  deltaE00,
  rgb8ToLab,
} from '../../personal-color/services/personalColorCore/colorMath';
import type {
  Lab,
  NativePersonalColorResult,
  NativeRegionStats,
  Rgb,
} from '../../personal-color/services/personalColorCore/contracts';

export type FaceProfilePixelSignals = Pick<
  FaceProfileColor,
  | 'overallFaceContrast'
  | 'eyeSkinContrast'
  | 'browSkinContrast'
  | 'lipSkinContrast'
  | 'skinEvenness'
  | 'redness'
  | 'yellowness'
>;

const RELATIVE_CAPTURE_WARNING =
  'relative_capture_value_not_medical_diagnosis';

type LabSignal = {
  confidence: number;
  lab: Lab;
};

function unavailable(reason: string): FaceMeasurement<number> {
  return {
    confidence: 0,
    nullReason: reason,
    source: 'pixel_roi',
    value: null,
    warnings: [reason],
  };
}

function measured(
  value: number,
  confidence: number,
  warnings: readonly string[] = [],
): FaceMeasurement<number> {
  return {
    confidence: clamp(confidence, 0, 1),
    source: 'pixel_roi',
    value,
    warnings: [...new Set(warnings)],
  };
}

function regionWeight(region: NativeRegionStats): number {
  return Math.max(1e-6, region.confidence) *
    Math.max(1e-6, region.roiCoverage ?? region.areaRatio);
}

function combineRegions(
  regions: readonly (NativeRegionStats | undefined)[],
): LabSignal | null {
  const present = regions.filter(
    (region): region is NativeRegionStats =>
      Boolean(region && region.sampleCount > 0),
  );
  if (present.length === 0) return null;
  const totalWeight = present.reduce(
    (sum, region) => sum + regionWeight(region),
    0,
  );
  const rgb = present.reduce<Rgb>(
    (mean, region) => {
      const weight = regionWeight(region) / totalWeight;
      mean.r += region.rgbMean.r * weight;
      mean.g += region.rgbMean.g * weight;
      mean.b += region.rgbMean.b * weight;
      return mean;
    },
    {b: 0, g: 0, r: 0},
  );
  return {
    confidence: clamp(
      present.reduce(
        (sum, region) => sum + region.confidence * regionWeight(region),
        0,
      ) / totalWeight,
      0,
      1,
    ),
    lab: rgb8ToLab(rgb),
  };
}

function contrast(
  skin: LabSignal | null,
  target: LabSignal | null,
  missingReason: string,
): FaceMeasurement<number> {
  if (!skin) return unavailable('skin_region_missing');
  if (!target) return unavailable(missingReason);
  return measured(
    deltaE00(skin.lab, target.lab),
    Math.min(skin.confidence, target.confidence),
  );
}

export function computeFaceProfilePixelSignals(
  native: NativePersonalColorResult,
): FaceProfilePixelSignals {
  const regions = native.regions ?? {};
  const combinedSkin = combineSkinPatches(native);
  const skin = combinedSkin
    ? {confidence: combinedSkin.confidence, lab: rgb8ToLab(combinedSkin.rgbMean)}
    : null;
  const eye = combineRegions([regions.eyeLeft, regions.eyeRight]);
  const brow = combineRegions([regions.browLeft, regions.browRight]);
  const hair = combineRegions([regions.hair]);
  const lip = combineRegions([regions.lip]);

  const eyeSkinContrast = contrast(skin, eye, 'eye_region_missing');
  const browSkinContrast = contrast(skin, brow, 'brow_region_missing');
  const lipSkinContrast = contrast(skin, lip, 'lip_region_missing');
  const hairSkinContrast = contrast(skin, hair, 'hair_region_missing');

  const weightedContrasts = [
    {measurement: hairSkinContrast, weight: 0.3},
    {measurement: browSkinContrast, weight: 0.2},
    {measurement: eyeSkinContrast, weight: 0.2},
    {measurement: lipSkinContrast, weight: 0.3},
  ].filter(
    (entry): entry is {
      measurement: FaceMeasurement<number> & {value: number};
      weight: number;
    } => entry.measurement.value !== null,
  );
  const contrastWeight = weightedContrasts.reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );
  const overallFaceContrast = contrastWeight === 0
    ? unavailable('contrast_regions_missing')
    : measured(
        weightedContrasts.reduce(
          (sum, entry) => sum + entry.measurement.value * entry.weight,
          0,
        ) / contrastWeight,
        weightedContrasts.reduce(
          (sum, entry) => sum + entry.measurement.confidence * entry.weight,
          0,
        ) / contrastWeight,
      );

  const cheekLeft = combineRegions([regions.skinCheekLeft]);
  const cheekRight = combineRegions([regions.skinCheekRight]);
  const forehead = combineRegions([regions.skinForehead]);
  let skinEvenness: FaceMeasurement<number>;
  if (!cheekLeft || !cheekRight || !forehead) {
    skinEvenness = unavailable('skin_uniformity_regions_missing');
  } else {
    const cheekDelta = deltaE00(cheekLeft.lab, cheekRight.lab);
    const foreheadDelta =
      (deltaE00(forehead.lab, cheekLeft.lab) +
        deltaE00(forehead.lab, cheekRight.lab)) /
      2;
    skinEvenness = measured(
      clamp(1 - (0.6 * cheekDelta + 0.4 * foreheadDelta) / 20, 0, 1),
      Math.min(
        cheekLeft.confidence,
        cheekRight.confidence,
        forehead.confidence,
      ),
    );
  }

  const redness = skin
    ? measured(
        clamp((skin.lab.a + 10) / 40, 0, 1),
        skin.confidence,
        [RELATIVE_CAPTURE_WARNING],
      )
    : unavailable('skin_region_missing');
  const yellowness = skin
    ? measured(
        clamp((skin.lab.b + 10) / 50, 0, 1),
        skin.confidence,
        [RELATIVE_CAPTURE_WARNING],
      )
    : unavailable('skin_region_missing');

  return {
    browSkinContrast,
    eyeSkinContrast,
    lipSkinContrast,
    overallFaceContrast,
    redness,
    skinEvenness,
    yellowness,
  };
}
