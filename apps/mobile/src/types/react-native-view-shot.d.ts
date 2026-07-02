declare module 'react-native-view-shot' {
  import type {RefObject} from 'react';
  import type {Component, ComponentClass} from 'react';
  import type {View} from 'react-native';

  export type CaptureRefOptions = {
    fileName?: string;
    format?: 'jpg' | 'png' | 'webm';
    quality?: number;
    result?: 'base64' | 'data-uri' | 'tmpfile';
    snapshotContentContainer?: boolean;
  };

  export function captureRef(
    target: number | RefObject<View | null> | Component | ComponentClass,
    options?: CaptureRefOptions,
  ): Promise<string>;
}
