import React, {useEffect, useMemo, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';
import type {CameraType} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {ChevronDown, ChevronUp} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button, Text} from 'tamagui';

import {
  getDefaultMakeupFilter,
  getARMakeupGuideData,
} from '../../../shared/services/makeupGuideService';
import {useCameraSessionActive} from '../../../shared/hooks/useCameraSessionActive';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  ARFilterLaunchSource,
  ComparisonMode,
  FilterColorOption,
  GuideMode,
} from '../../../shared/types/makeupGuide';
import {
  BottomOverlayPanel,
  FullscreenOverlayScreen,
  useTransientToast,
} from '../../../shared/ui';
import {loadOptionalMediaLibraryModule} from '../../../shared/services/optionalNativeShareModules';
import {FullFaceMakeupEditPanel} from '../components/FullFaceMakeupEditPanel';
import {
  AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_BACKGROUND_COLOR,
  AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_BORDER_COLOR,
  AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_SIZE,
  ARFilterBottomActions,
} from '../components/ARFilterBottomActions';
import {
  AR_FILTER_COMPARISON_DIVIDER_TOP,
  ARFilterCameraPreview,
  getARFilterCameraMode,
  getMakeupPreviewBadgeContent,
  getMakeupPreviewColorOverlayLayers,
  shouldShowARFilterHeaderCopy,
} from '../components/ARFilterCameraPreview';
import {
  ARFilterCaptureControls,
  getARFilterCaptureButtonMetrics,
  type CaptureMode,
} from '../components/ARFilterCaptureControls';
import {ARFilterMakeupAreaTabs} from '../components/ARFilterMakeupAreaTabs';
import {ARFilterFitWorkspace} from '../components/ARFilterFitWorkspace';
import {
  ARFilterModeTabs,
  getARFilterGuideModeControlBottomOffset,
  getARFilterComparisonTabs as getARFilterComparisonTabsForData,
  getARFilterModeTabHeight,
  getARFilterSelectedTabOpacity,
} from '../components/ARFilterModeTabs';
import {
  ARFilterOptionCardList,
  getARFilterCategoryTitle,
} from '../components/ARFilterOptionCardList';
import {ARFilterOptionGroupTabs} from '../components/ARFilterOptionGroupTabs';
import {
  ARFilterEditModeTabs,
  type ARFilterEditMode,
} from '../components/ARFilterEditModeTabs';
import {
  ARFilterWorkspaceTabs,
  type ARFilterWorkspaceLane,
} from '../components/ARFilterWorkspaceTabs';
import {ARTutorialGuidePanel} from '../components/ARTutorialGuidePanel';
import {useARFilterSelectionState} from '../hooks/useARFilterSelectionState';
import {useFullFaceMakeupEditState} from '../hooks/useFullFaceMakeupEditState';
import type {FullFaceMakeupEditState} from '../services/fullFaceMakeupEditService';
import type {FilterShapePreset} from '../services/filterCustomizationService';
import {
  getARFilterInitialColorId,
  getARFilterOptionGroupLabels,
  getARFilterOriginalCardLabel,
  getARFilterSelectedColor as getARFilterSelectedColorFromRules,
  getARFilterSelectedMakeupFilter,
  getARFilterShapeOptionLabels,
  getARFilterTotalMakeupLookIdAfterOptionEdit,
  isARFilterSaveEnabled,
  resolveAreaColorOptions,
} from '../services/arFilterOptionRules';
import {
  getARFilterDetailEditButtonLabel,
  getARFilterEditActionButtonLabel,
  getARFilterEditActionOptions,
  getARFilterSaveButtonLabel,
  getARFilterShapeEditButtonLabel,
} from '../components/ARFilterBottomActions';
import {
  createUnityMakeupRecipeBatchFromARFilterSelections,
  getUnityMakeupRecipeExcludedRegions,
  hideUnityMakeupView,
  postUnityMakeupRecipe,
  postUnityTutorialGuide,
  requestUnityARPhotoCapture,
  setUnityMakeupPlayerPaused,
} from '../services/unityMakeupBridge';
import {
  buildARTutorialGuidePayload,
  DEFAULT_AR_TUTORIAL_GUIDE_CONFIG,
  getARTutorialGuideSteps,
  type ARTutorialGuidePayload,
} from '../services/arTutorialGuide';

type ARFilterScreenProps = {
  editMode?: ARFilterEditMode;
  editSourceImageSource?: ImageSourcePropType | null;
  editSourceImageUri?: string | null;
  fullFaceEditState?: FullFaceMakeupEditState;
  initialComparisonMode?: ComparisonMode;
  initialGuideMode?: GuideMode;
  initialMakeupFilterId?: string;
  initialShapePreset?: FilterShapePreset;
  initialSource?: ARFilterLaunchSource;
  onBack?: () => void;
  onOpenDetailEdit?: (
    selectedMakeupFilterId?: string,
    editSourceImageUri?: string,
  ) => void;
  onOpenShapeAdjust?: (
    selectedMakeupFilterId?: string,
    editSourceImageUri?: string,
    shapePreset?: FilterShapePreset,
  ) => void;
  onSave?: (selectedMakeupFilterId?: string) => void;
};

const AR_FILTER_FALLBACK_COLOR = {
  hex: colors.white,
  label: '기본',
};

const AR_TUTORIAL_GUIDE_OFF_PAYLOAD: ARTutorialGuidePayload = {
  blush: false,
  brows: false,
  dash: false,
  enabled: false,
  eyeliner: false,
  lips: false,
  midline: false,
  opacity: 0,
  pairs: false,
  pulse: false,
};

export const AR_FILTER_BOTTOM_SHEET_BOTTOM_OFFSET = 0;
export const AR_FILTER_BOTTOM_SHEET_TOGGLE_PLACEMENT = 'aboveSheet';
export const AR_FILTER_SHEET_TOGGLE_BUTTON_SIZE =
  AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_SIZE;
export const AR_FILTER_BOTTOM_SHEET_PADDING = spacing.sm;
export const AR_FILTER_SHEET_TOGGLE_BACKGROUND_COLOR =
  AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_BACKGROUND_COLOR;
export const AR_FILTER_SHEET_TOGGLE_BORDER_COLOR =
  AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_BORDER_COLOR;
export const AR_FILTER_BOTTOM_ACTIONS_PLACEMENT = 'aboveSheet' as const;
export const AR_FILTER_FLOATING_SHEET_CONTROLS_GAP = spacing.xs;
export const AR_FILTER_FLOATING_SHEET_CONTROLS_BOTTOM_GAP = spacing.md;
export const AR_FILTER_FLOATING_SHEET_CONTROLS_LEFT_PADDING =
  spacing.md;
export const AR_FILTER_FLOATING_SHEET_CONTROLS_RIGHT_PADDING =
  spacing.md;
export const AR_FILTER_FLOATING_SHEET_CONTROLS_JUSTIFY_CONTENT =
  'space-between' as const;
export const AR_FILTER_FLOATING_SHEET_ACTIONS_FLEX = 1;
export const AR_FILTER_CAMERA_CONTROLS_HOME_INDICATOR_CLEARANCE =
  spacing.xxl * 5;
export const AR_FILTER_CAMERA_CONTROLS_BOTTOM_POSITION = 'raised' as const;
export const AR_FILTER_CAPTURE_CONTROLS_BOTTOM_PADDING =
  AR_FILTER_CAMERA_CONTROLS_HOME_INDICATOR_CLEARANCE;
export const AR_FILTER_GALLERY_PICKER_MEDIA_TYPES = ['images'] as const;
export const AR_FILTER_GALLERY_PICKER_ALLOWS_EDITING = false;
export const AR_FILTER_GALLERY_PICKER_QUALITY = 0.9;
export const AR_FILTER_GALLERY_PREVIEW_BEHAVIOR =
  'replaceLiveCameraPreview' as const;
export const AR_FILTER_BOTTOM_SHEET_PANEL_TOP_PADDING = spacing.xl + 2;
export const AR_FILTER_BOTTOM_SHEET_PANEL_HORIZONTAL_PADDING = AR_FILTER_BOTTOM_SHEET_PADDING;
export const AR_FILTER_SHEET_TOGGLE_MARGIN_SOURCE = 'floatingControlsPadding' as const;
export const AR_FILTER_SHEET_TOGGLE_LEFT_OFFSET = 0;
export const AR_FILTER_SHEET_TOGGLE_ALIGNMENT = 'sheetContentStart' as const;
export const AR_FILTER_BOTTOM_SHEET_PANEL_GAP = spacing.xs;
export const AR_FILTER_BOTTOM_SHEET_CONTENT_GAP = spacing.sm;
export const AR_FILTER_BOTTOM_SHEET_CONTENT_BOTTOM_PADDING = AR_FILTER_BOTTOM_SHEET_PADDING;
export const AR_FILTER_BOTTOM_SHEET_BACKGROUND_COLOR = colors.arFilterBottomSheetSurface;
export const AR_FILTER_BOTTOM_SHEET_PANEL_MAX_HEIGHT = 640;
export const AR_FILTER_BOTTOM_SHEET_SCROLL_MAX_HEIGHT = 380;
export const AR_FILTER_BOTTOM_SHEET_SCROLL_POLICY =
  'fitsDefaultFilterControls' as const;

export {
  getARFilterCameraMode,
  getARFilterCaptureButtonMetrics,
  getARFilterCategoryTitle,
  getARFilterInitialColorId,
  AR_FILTER_COMPARISON_DIVIDER_TOP,
  getARFilterGuideModeControlBottomOffset,
  getARFilterModeTabHeight,
  getARFilterOptionGroupLabels,
  getARFilterOriginalCardLabel,
  getARFilterDetailEditButtonLabel,
  getARFilterEditActionButtonLabel,
  getARFilterEditActionOptions,
  getARFilterSaveButtonLabel,
  getARFilterSelectedTabOpacity,
  getARFilterShapeEditButtonLabel,
  getARFilterShapeOptionLabels,
  getARFilterTotalMakeupLookIdAfterOptionEdit,
  getMakeupPreviewBadgeContent,
  getMakeupPreviewColorOverlayLayers,
  isARFilterSaveEnabled,
  shouldShowARFilterHeaderCopy,
};

export function getARFilterComparisonTabs(): readonly string[] {
  return getARFilterComparisonTabsForData(getARMakeupGuideData());
}

export function getARFilterSelectedColor(
  colorOptions: readonly FilterColorOption[],
  selectedColorId: string,
) {
  return getARFilterSelectedColorFromRules({
    colorOptions,
    fallbackColor: AR_FILTER_FALLBACK_COLOR,
    selectedColorId,
  });
}

export function ARFilterScreen({
  editMode,
  editSourceImageSource,
  editSourceImageUri,
  fullFaceEditState,
  initialComparisonMode = 'left',
  initialGuideMode = 'basic',
  initialMakeupFilterId,
  initialShapePreset,
  initialSource,
  onBack,
  onOpenDetailEdit,
  onOpenShapeAdjust,
  onSave,
}: ARFilterScreenProps) {
  const insets = useSafeAreaInsets();
  const isFullFaceMode = Boolean(fullFaceEditState);
  const isPhotoEditMode = Boolean(editMode);
  const arGuideData = useMemo(() => getARMakeupGuideData(), []);
  const defaultFilter = useMemo(
    () => getDefaultMakeupFilter(arGuideData),
    [arGuideData],
  );
  const arFilterSelectionState = useARFilterSelectionState({
    arGuideData,
    defaultFilter,
    initialComparisonMode,
    initialGuideMode,
    initialMakeupFilterId,
    initialSource,
  });
  const fullFaceEdit = useFullFaceMakeupEditState({initialState: fullFaceEditState});
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo');
  const [cameraFacing, setCameraFacing] = useState<CameraType>('front');
  const [isFilterSheetExpanded, setIsFilterSheetExpanded] = useState(true);
  const [workspaceLane, setWorkspaceLane] =
    useState<ARFilterWorkspaceLane>('makeup');
  const [tutorialGuideConfig, setTutorialGuideConfig] = useState(
    DEFAULT_AR_TUTORIAL_GUIDE_CONFIG,
  );
  const [sourceImageUri, setSourceImageUri] = useState<string | null>(null);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [isGalleryPickerOpen, setIsGalleryPickerOpen] = useState(false);
  const {showToast, toast} = useTransientToast(2200);
  const cameraSessionActive = useCameraSessionActive();
  const selectedColor = getARFilterSelectedColor(
    resolveAreaColorOptions(
      arFilterSelectionState.selectedMakeupArea,
      arFilterSelectionState.selectedMakeupFilter.colorOptions,
    ),
    arFilterSelectionState.selectedColorId,
  );
  const previewColorHex = isFullFaceMode
    ? fullFaceEdit.activeFullFaceControl.colorHex
    : selectedColor.hex;
  const photoEditImageSource =
    editSourceImageSource ?? arFilterSelectionState.selectedMakeupFilter.imageSource;
  const supportsStudioWorkspace = !isFullFaceMode && !isPhotoEditMode;
  const unitySelections = useMemo(
    () => arGuideData.makeupAreas.map(makeupArea => {
      const selectionState =
        arFilterSelectionState.getSelectionStateForMakeupArea(makeupArea.id);
      const selectedMakeupFilter = getARFilterSelectedMakeupFilter({
        defaultFilter,
        makeupFilters: arGuideData.filters,
        selectedMakeupArea: makeupArea.id,
        selectedPointMakeupLookId: selectionState.selectedPointMakeupLookId,
        selectedTotalMakeupLookId: selectionState.selectedTotalMakeupLookId,
      });

      return {
        selectedColor: getARFilterSelectedColor(
          resolveAreaColorOptions(makeupArea.id, selectedMakeupFilter.colorOptions),
          selectionState.selectedColorId,
        ),
        selectedColorId: selectionState.selectedColorId,
        selectedMakeupArea: makeupArea.id,
        selectedMakeupFilter,
        selectedPointMakeupLookId: selectionState.selectedPointMakeupLookId,
        selectedShapeId: selectionState.selectedShapeId,
        selectedTextureId: selectionState.selectedTextureId,
        selectedTotalMakeupLookId: selectionState.selectedTotalMakeupLookId,
        selectedTypeId: selectionState.selectedTypeId,
      };
    }),
    [
      arFilterSelectionState.selectionStatesByArea,
      arGuideData.filters,
      arGuideData.makeupAreas,
      defaultFilter,
    ],
  );
  const excludedUnityRecipeRegions = useMemo(
    () => getUnityMakeupRecipeExcludedRegions(unitySelections),
    [unitySelections],
  );
  const tutorialGuideSteps = useMemo(
    () => getARTutorialGuideSteps(unitySelections, excludedUnityRecipeRegions),
    [excludedUnityRecipeRegions, unitySelections],
  );
  const tutorialGuidePayload = useMemo(
    () => buildARTutorialGuidePayload({
      config: tutorialGuideConfig,
      enabled:
        cameraSessionActive &&
        supportsStudioWorkspace &&
        workspaceLane === 'guide',
      steps: tutorialGuideSteps,
    }),
    [
      cameraSessionActive,
      supportsStudioWorkspace,
      tutorialGuideConfig,
      tutorialGuideSteps,
      workspaceLane,
    ],
  );

  useEffect(() => {
    // 보고서/얼굴촬영 화면이 Unity 플레이어를 pause했을 수 있으니 AR 필터 진입 시
    // 재개한다. 네이티브 pause:0은 idempotent(이미 실행 중이면 no-op)라 안전.
    setUnityMakeupPlayerPaused(false);
    return () => {
      postUnityTutorialGuide(AR_TUTORIAL_GUIDE_OFF_PAYLOAD);
      hideUnityMakeupView();
    };
  }, []);

  useEffect(() => {
    postUnityTutorialGuide(tutorialGuidePayload);
  }, [tutorialGuidePayload]);

  useEffect(() => {
    if (!cameraSessionActive) {
      hideUnityMakeupView();
    }
  }, [cameraSessionActive]);

  const handleBack = () => {
    postUnityTutorialGuide(AR_TUTORIAL_GUIDE_OFF_PAYLOAD);
    hideUnityMakeupView();
    onBack?.();
  };

  const handleCameraFacingToggle = () => {
    setSourceImageUri(null);
    setCameraFacing(currentFacing => (currentFacing === 'front' ? 'back' : 'front'));
  };

  const handleCapture = async () => {
    if (isCapturingPhoto || captureMode !== 'photo' || sourceImageUri) {
      return;
    }

    const mediaLibrary = loadOptionalMediaLibraryModule();
    if (!mediaLibrary) {
      showToast('사진 저장 모듈을 사용할 수 없어요.');
      return;
    }

    setIsCapturingPhoto(true);
    try {
      const currentPermission = await mediaLibrary.getPermissionsAsync(true, ['photo']);
      const permission = currentPermission.granted
        ? currentPermission
        : await mediaLibrary.requestPermissionsAsync(true, ['photo']);

      if (!permission.granted) {
        showToast('AR 사진을 저장하려면 사진 접근 권한이 필요해요.');
        return;
      }

      const result = await requestUnityARPhotoCapture();
      const capturePath = result.path;
      if (!capturePath) {
        throw new Error('Unity가 촬영 파일 경로를 반환하지 않았어요.');
      }
      const imageUri = capturePath.startsWith('file://')
        ? capturePath
        : `file://${capturePath}`;

      try {
        await mediaLibrary.saveToLibraryAsync(imageUri);
      } catch {
        await mediaLibrary.createAssetAsync(imageUri);
      }
      showToast('AR 사진을 사진 앱에 저장했어요.');
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'AR 사진을 저장하지 못했어요.',
      );
    } finally {
      setIsCapturingPhoto(false);
    }
  };

  const handleOpenGallery = async () => {
    if (isGalleryPickerOpen) {
      return;
    }

    setIsGalleryPickerOpen(true);

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: AR_FILTER_GALLERY_PICKER_ALLOWS_EDITING,
        mediaTypes: [...AR_FILTER_GALLERY_PICKER_MEDIA_TYPES],
        quality: AR_FILTER_GALLERY_PICKER_QUALITY,
      });
      const pickedAsset = pickerResult.canceled ? null : pickerResult.assets[0];

      if (!pickedAsset?.uri) {
        return;
      }

      hideUnityMakeupView();
      setSourceImageUri(pickedAsset.uri);
    } finally {
      setIsGalleryPickerOpen(false);
    }
  };

  const getActiveMakeupFilterId = () =>
    arFilterSelectionState.selectedTotalMakeupLookId ??
    arFilterSelectionState.selectedMakeupFilter.id;

  const handleOpenDetailEdit = () => {
    onOpenDetailEdit?.(getActiveMakeupFilterId(), sourceImageUri ?? undefined);
  };

  const handleOpenShapeAdjust = () => {
    onOpenShapeAdjust?.(
      arFilterSelectionState.selectedTotalMakeupLookId ??
        arFilterSelectionState.selectedMakeupFilter.id,
      sourceImageUri ?? undefined,
      initialShapePreset,
    );
  };

  const handleSave = () => {
    onSave?.(
      arFilterSelectionState.selectedTotalMakeupLookId ??
        arFilterSelectionState.selectedMakeupFilter.id,
    );
  };

  useEffect(() => {
    if (isFullFaceMode || isPhotoEditMode) {
      return;
    }

    // The target app owns an RNBridge/E3 runtime. The old ARwithFable flat
    // FilterParams path addressed NativeBridge.OnMessageFromRN, but that object
    // does not exist in this Unity project. Compile the same RN selection state
    // into the target's supported full recipe contract instead.
    const halfFaceMode =
      arFilterSelectionState.guideMode === 'half' &&
      arFilterSelectionState.selectedComparisonMode !== 'full'
        ? arFilterSelectionState.selectedComparisonMode
        : 'off';
    postUnityMakeupRecipe(
      createUnityMakeupRecipeBatchFromARFilterSelections(
        unitySelections,
        Date.now(),
        halfFaceMode,
        excludedUnityRecipeRegions,
        initialShapePreset,
      ),
    );
  }, [
    arFilterSelectionState.guideMode,
    arFilterSelectionState.selectedComparisonMode,
    excludedUnityRecipeRegions,
    isFullFaceMode,
    isPhotoEditMode,
    initialShapePreset,
    unitySelections,
  ]);

  useEffect(() => {
    if (!isFullFaceMode) {
      return;
    }

    postUnityMakeupRecipe(fullFaceEdit.fullFaceRecipe);
  }, [fullFaceEdit.fullFaceRecipe, isFullFaceMode]);

  return (
    <FullscreenOverlayScreen>
      <ARFilterCameraPreview
        active={cameraSessionActive}
        cameraFacing={cameraFacing}
        comparisonDividerTopOffset={getARFilterGuideModeControlBottomOffset(insets.top)}
        guideMode={isPhotoEditMode ? 'basic' : arFilterSelectionState.guideMode}
        previewColorHex={previewColorHex}
        selectedComparisonMode={arFilterSelectionState.selectedComparisonMode}
        sourceImageSource={isPhotoEditMode ? photoEditImageSource : undefined}
        sourceImageUri={isPhotoEditMode ? editSourceImageUri : sourceImageUri}
      />

      {editMode ? (
        <ARFilterEditModeTabs
          activeMode={editMode}
          onBack={handleBack}
          onModeChange={mode => {
            if (mode === editMode) {
              return;
            }

            if (mode === 'product') {
              handleOpenDetailEdit();
              return;
            }

            handleOpenShapeAdjust();
          }}
          onSave={handleSave}
          topInset={insets.top}
        />
      ) : (
        <ARFilterModeTabs
          arGuideData={arGuideData}
          guideMode={arFilterSelectionState.guideMode}
          onBack={handleBack}
          onComparisonModeChange={arFilterSelectionState.setSelectedComparisonMode}
          onGuideModeChange={arFilterSelectionState.setGuideMode}
          selectedComparisonMode={arFilterSelectionState.selectedComparisonMode}
          topInset={insets.top}
        />
      )}

      <View pointerEvents="box-none" style={styles.bottomSheetHost}>
        <View pointerEvents="box-none" style={styles.aboveSheetControls}>
          {AR_FILTER_BOTTOM_SHEET_TOGGLE_PLACEMENT === 'aboveSheet' ? (
            <Button
              accessibilityLabel={
                isFilterSheetExpanded ? '필터 선택 바텀시트 접기' : '필터 선택 바텀시트 펼치기'
              }
              accessibilityRole="button"
              accessibilityState={{expanded: isFilterSheetExpanded}}
              onPress={() => setIsFilterSheetExpanded(currentValue => !currentValue)}
              pressStyle={{scale: 0.96}}
              style={styles.sheetToggleButton}
              unstyled>
              {isFilterSheetExpanded ? (
                <ChevronDown color={colors.textPrimary} size={iconSize.sm} />
              ) : (
                <ChevronUp color={colors.textPrimary} size={iconSize.sm} />
              )}
            </Button>
          ) : null}

          {isFilterSheetExpanded &&
          AR_FILTER_BOTTOM_ACTIONS_PLACEMENT === 'aboveSheet' &&
          !isPhotoEditMode &&
          workspaceLane === 'makeup' ? (
            <View style={styles.floatingSheetActions}>
              <ARFilterBottomActions
                hasUnsavedMakeupChanges={arFilterSelectionState.hasUnsavedMakeupChanges}
                onOpenDetailEdit={handleOpenDetailEdit}
                onOpenShapeAdjust={handleOpenShapeAdjust}
                onSave={handleSave}
              />
            </View>
          ) : null}
        </View>

        <BottomOverlayPanel
          variant="sheet"
          style={[
            styles.controlsPanel,
            {
              paddingBottom:
                insets.bottom +
                (isPhotoEditMode
                  ? spacing.lg
                  : AR_FILTER_CAPTURE_CONTROLS_BOTTOM_PADDING),
            },
          ]}>
          {isFilterSheetExpanded ? (
            <ScrollView
              contentContainerStyle={styles.panelContent}
              horizontal={false}
              showsVerticalScrollIndicator={false}
              style={styles.panelScroll}>
              {supportsStudioWorkspace ? (
                <ARFilterWorkspaceTabs
                  activeLane={workspaceLane}
                  onLaneChange={setWorkspaceLane}
                />
              ) : null}

              {isFullFaceMode ? (
                <FullFaceMakeupEditPanel {...fullFaceEdit} />
              ) : supportsStudioWorkspace && workspaceLane === 'fit' ? (
                <ARFilterFitWorkspace
                  onOpenDetailEdit={handleOpenDetailEdit}
                  onOpenShapeAdjust={handleOpenShapeAdjust}
                />
              ) : supportsStudioWorkspace && workspaceLane === 'guide' ? (
                <ARTutorialGuidePanel
                  config={tutorialGuideConfig}
                  onChange={setTutorialGuideConfig}
                  steps={tutorialGuideSteps}
                />
              ) : (
                <>
                  <ARFilterMakeupAreaTabs
                    makeupAreas={arGuideData.makeupAreas}
                    onMakeupAreaPress={arFilterSelectionState.handleMakeupAreaOptionPress}
                    selectedMakeupArea={arFilterSelectionState.selectedMakeupArea}
                  />

                  <ARFilterOptionGroupTabs
                    onOptionGroupPress={arFilterSelectionState.setSelectedMakeupOptionGroup}
                    optionGroups={arFilterSelectionState.availableOptionGroups}
                    selectedMakeupOptionGroup={arFilterSelectionState.selectedMakeupOptionGroup}
                  />

                  <ARFilterOptionCardList
                    arGuideData={arGuideData}
                    availableMakeupFilters={arFilterSelectionState.availableMakeupFilters}
                    onCategoryPress={arFilterSelectionState.handleCategoryPress}
                    onColorOptionPress={arFilterSelectionState.handleColorOptionPress}
                    onMakeupFilterPress={arFilterSelectionState.handleMakeupFilterPress}
                    onOriginalOptionPress={arFilterSelectionState.handleOriginalOptionPress}
                    onShapeOptionPress={arFilterSelectionState.handleShapeOptionPress}
                    onTextureOptionPress={arFilterSelectionState.handleTextureOptionPress}
                    onTypeOptionPress={arFilterSelectionState.handleTypeOptionPress}
                    selectedCategoryId={arFilterSelectionState.selectedCategoryId}
                    selectedColorId={arFilterSelectionState.selectedColorId}
                    selectedMakeupArea={arFilterSelectionState.selectedMakeupArea}
                    selectedMakeupFilter={arFilterSelectionState.selectedMakeupFilter}
                    selectedMakeupOptionGroup={arFilterSelectionState.selectedMakeupOptionGroup}
                    selectedPointMakeupLookId={arFilterSelectionState.selectedPointMakeupLookId}
                    selectedShapeId={arFilterSelectionState.selectedShapeId}
                    selectedTextureId={arFilterSelectionState.selectedTextureId}
                    selectedTotalMakeupLookId={arFilterSelectionState.selectedTotalMakeupLookId}
                    selectedTypeId={arFilterSelectionState.selectedTypeId}
                    shapeOptions={arFilterSelectionState.shapeOptions}
                  />
                </>
              )}
            </ScrollView>
          ) : null}

          {!isPhotoEditMode ? (
            <ARFilterCaptureControls
              cameraFacing={cameraFacing}
              captureMode={captureMode}
              isCaptureDisabled={isCapturingPhoto || Boolean(sourceImageUri)}
              isGalleryDisabled={isGalleryPickerOpen}
              onCameraFacingToggle={handleCameraFacingToggle}
              onCapture={handleCapture}
              onCaptureModeChange={setCaptureMode}
              onOpenGallery={handleOpenGallery}
              supportsCameraFacingToggle={false}
              supportsGallery={false}
              supportsVideoCapture={false}
            />
          ) : null}
        </BottomOverlayPanel>
      </View>
      {toast}
    </FullscreenOverlayScreen>
  );
}

const styles = StyleSheet.create({
  bottomSheetHost: {
    bottom: AR_FILTER_BOTTOM_SHEET_BOTTOM_OFFSET,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 4,
  },
  aboveSheetControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AR_FILTER_FLOATING_SHEET_CONTROLS_GAP,
    justifyContent: AR_FILTER_FLOATING_SHEET_CONTROLS_JUSTIFY_CONTENT,
    marginBottom: AR_FILTER_FLOATING_SHEET_CONTROLS_BOTTOM_GAP,
    paddingLeft: AR_FILTER_FLOATING_SHEET_CONTROLS_LEFT_PADDING,
    paddingRight: AR_FILTER_FLOATING_SHEET_CONTROLS_RIGHT_PADDING,
    width: '100%',
  },
  floatingSheetActions: {
    alignItems: 'flex-end',
    flex: AR_FILTER_FLOATING_SHEET_ACTIONS_FLEX,
  },
  controlsPanel: {
    backgroundColor: AR_FILTER_BOTTOM_SHEET_BACKGROUND_COLOR,
    gap: AR_FILTER_BOTTOM_SHEET_PANEL_GAP,
    maxHeight: AR_FILTER_BOTTOM_SHEET_PANEL_MAX_HEIGHT,
    paddingHorizontal: AR_FILTER_BOTTOM_SHEET_PANEL_HORIZONTAL_PADDING,
    paddingTop: AR_FILTER_BOTTOM_SHEET_PANEL_TOP_PADDING,
  },
  panelScroll: {
    maxHeight: AR_FILTER_BOTTOM_SHEET_SCROLL_MAX_HEIGHT,
    paddingHorizontal: 0,
  },
  panelContent: {
    gap: AR_FILTER_BOTTOM_SHEET_CONTENT_GAP,
    paddingBottom: AR_FILTER_BOTTOM_SHEET_CONTENT_BOTTOM_PADDING,
    paddingHorizontal: 0,
  },
  sheetToggleButton: {
    alignItems: 'center',
    backgroundColor: AR_FILTER_SHEET_TOGGLE_BACKGROUND_COLOR,
    borderColor: AR_FILTER_SHEET_TOGGLE_BORDER_COLOR,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: AR_FILTER_SHEET_TOGGLE_BUTTON_SIZE,
    justifyContent: 'center',
    marginLeft: AR_FILTER_SHEET_TOGGLE_LEFT_OFFSET,
    width: AR_FILTER_SHEET_TOGGLE_BUTTON_SIZE,
  },
});
