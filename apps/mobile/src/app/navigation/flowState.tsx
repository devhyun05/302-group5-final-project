import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import type {FaceCaptureUploadResult} from '../../features/face-capture/services/faceCaptureUploadService';

export const NAVIGATION_FLOW_STATE_PROVIDER_ERROR =
  'useNavigationFlowState must be used inside NavigationFlowStateProvider';

export type NavigationFlowState = {
  selectedFaceCapture: FaceCaptureUploadResult | null;
};

export type NavigationFlowStateContextValue = NavigationFlowState & {
  setSelectedFaceCapture: Dispatch<SetStateAction<FaceCaptureUploadResult | null>>;
};

const NavigationFlowStateContext =
  createContext<NavigationFlowStateContextValue | null>(null);

export function getInitialNavigationFlowState(): NavigationFlowState {
  return {
    selectedFaceCapture: null,
  };
}

export function getNavigationFlowStateProviderErrorMessage() {
  return NAVIGATION_FLOW_STATE_PROVIDER_ERROR;
}

type NavigationFlowStateProviderProps = {
  children: ReactNode;
  initialState?: NavigationFlowState;
};

export function NavigationFlowStateProvider({
  children,
  initialState = getInitialNavigationFlowState(),
}: NavigationFlowStateProviderProps) {
  const [selectedFaceCapture, setSelectedFaceCapture] =
    useState<FaceCaptureUploadResult | null>(initialState.selectedFaceCapture);

  const value = useMemo(
    () => ({
      selectedFaceCapture,
      setSelectedFaceCapture,
    }),
    [selectedFaceCapture],
  );

  return (
    <NavigationFlowStateContext.Provider value={value}>
      {children}
    </NavigationFlowStateContext.Provider>
  );
}

export function useNavigationFlowState() {
  const context = useContext(NavigationFlowStateContext);

  if (!context) {
    throw new Error(NAVIGATION_FLOW_STATE_PROVIDER_ERROR);
  }

  return context;
}
