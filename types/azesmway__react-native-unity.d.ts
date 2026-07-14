/**
 * @azesmway/react-native-unity 1.0.11의 package.json "types" 경로가 실제 산출물
 * (lib/typescript/src/index.d.ts)과 달라 타입이 로드되지 않는다.
 * 실제 컴포넌트 시그니처를 기준으로 한 로컬 선언. (style은 네이티브 뷰로
 * 전달되지만 원본 타입에 빠져 있어 여기서 보강한다.)
 */
declare module '@azesmway/react-native-unity' {
  import * as React from 'react';
  import type {
    NativeSyntheticEvent,
    StyleProp,
    ViewStyle,
  } from 'react-native';

  export interface UnityMessageEvent {
    message: string;
  }

  export interface UnityViewProps {
    style?: StyleProp<ViewStyle>;
    androidKeepPlayerMounted?: boolean;
    fullScreen?: boolean;
    onUnityMessage?: (event: NativeSyntheticEvent<UnityMessageEvent>) => void;
    onPlayerUnload?: (event: NativeSyntheticEvent<UnityMessageEvent>) => void;
    onPlayerQuit?: (event: NativeSyntheticEvent<UnityMessageEvent>) => void;
  }

  export default class UnityView extends React.Component<UnityViewProps> {
    postMessage(gameObject: string, methodName: string, message: string): void;
    unloadUnity(): void;
    pauseUnity(pause: boolean): void;
    resumeUnity(): void;
    windowFocusChanged(hasFocus?: boolean): void;
  }
}
