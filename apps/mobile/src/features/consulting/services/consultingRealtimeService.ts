import {AppState} from 'react-native';

import {getBackendApiBaseUrl} from '../../../shared/services/backendApi';

export type ConsultingParticipantType = 'user' | 'expert' | 'operator';

export type ConsultingSocketStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';

export type ConsultingRealtimeMessageEvent = {
  bookingId: string;
  body: string;
  clientMessageId?: string;
  id: string;
  media?: Array<{
    cdnUrl?: string | null;
    contentType?: string | null;
    id: string;
    thumbnailUrl?: string | null;
  }>;
  mediaIds?: string[];
  senderName: string;
  senderType: ConsultingParticipantType | 'system';
  sentAt: string;
  type: 'message.new';
};

export type ConsultingCaptionTranslationEvent = {
  bookingId: string;
  resultId: string;
  sourceLanguageCode: 'ko-KR' | 'en-US';
  targetLanguageCode: 'ko' | 'en';
  translatedContent: string;
  type: 'caption.translation';
};

export type ConsultingClientSocketEvent =
  | {
      at: string;
      type: 'ping';
    }
  | {
      body: string;
      bookingId: string;
      clientMessageId: string;
      mediaIds?: string[];
      type: 'message.send';
    }
  | {
      bookingId: string;
      isTyping: boolean;
      type: 'typing';
    }
  | {
      bookingId: string;
      readAt: string;
      type: 'read';
    };

export type ConsultingServerSocketEvent =
  | {
      bookingId: string;
      connectionId: string;
      participantType: ConsultingParticipantType;
      type: 'connected';
    }
  | {
      bookingId: string;
      messages: ConsultingRealtimeMessageEvent[];
      type: 'message.history';
    }
  | ConsultingRealtimeMessageEvent
  | ConsultingCaptionTranslationEvent
  | {
      bookingId: string;
      message: string;
      status: string;
      type: 'booking.status';
    }
  | {
      bookingId: string;
      message: string;
      participantType: ConsultingParticipantType;
      type: 'conversation.left';
    }
  | {
      bookingId: string;
      callSessionId?: string | null;
      message: string;
      status: 'started' | 'ended';
      type: 'call.status';
    }
  | {
      bookingId: string;
      clientMessageId: string;
      messageId: string;
      sentAt: string;
      type: 'message.ack';
    }
  | {
      bookingId: string;
      isTyping: boolean;
      senderType: ConsultingParticipantType;
      type: 'typing';
    }
  | {
      bookingId: string;
      readAt?: string | null;
      senderType: ConsultingParticipantType;
      type: 'read';
    }
  | {
      bookingId: string;
      participants: Array<{
        connectionCount: number;
        participantType: ConsultingParticipantType;
      }>;
      type: 'presence';
    }
  | {
      at?: string;
      type: 'pong';
    }
  | {
      clientMessageId?: string;
      code: string;
      message: string;
      type: 'error';
    };

type ConnectConsultingConversationSocketOptions = {
  authToken?: string | null;
  bookingId: string;
  onEvent: (event: ConsultingServerSocketEvent) => void;
  onStatusChange?: (status: ConsultingSocketStatus) => void;
  participantType?: ConsultingParticipantType;
};

export type ConsultingConversationSocketClient = {
  close: () => void;
  reconnect: () => void;
  send: (event: ConsultingClientSocketEvent) => boolean;
  sendMessage: (payload: {
    body: string;
    bookingId: string;
    clientMessageId: string;
    mediaIds?: string[];
  }) => boolean;
  sendRead: (bookingId: string) => boolean;
  sendTyping: (bookingId: string, isTyping: boolean) => boolean;
};

const MAX_RECONNECT_DELAY_MS = 5000;
const INITIAL_RECONNECT_DELAY_MS = 500;
const HEARTBEAT_INTERVAL_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const appResumeListeners = new Set<() => void>();
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let currentAppState = AppState.currentState;

function subscribeToAppResume(listener: () => void): () => void {
  appResumeListeners.add(listener);
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', nextAppState => {
      const resumed = currentAppState !== 'active' && nextAppState === 'active';
      currentAppState = nextAppState;
      if (resumed) {
        appResumeListeners.forEach(currentListener => currentListener());
      }
    });
  }

  return () => {
    appResumeListeners.delete(listener);
    if (appResumeListeners.size === 0) {
      appStateSubscription?.remove();
      appStateSubscription = null;
      currentAppState = AppState.currentState;
    }
  };
}

function getRealtimeBaseUrl(): URL {
  const apiBaseUrl = getBackendApiBaseUrl();

  if (!apiBaseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required for consulting realtime.');
  }

  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

export function buildConsultingWebSocketUrl({
  authToken,
  bookingId,
  participantType = 'user',
}: {
  authToken?: string | null;
  bookingId: string;
  participantType?: ConsultingParticipantType;
}): string {
  const url = getRealtimeBaseUrl();
  url.pathname = `${url.pathname}/consulting/ws/bookings/${encodeURIComponent(bookingId)}`;
  url.searchParams.set('participantType', participantType);

  if (authToken) {
    url.searchParams.set('token', authToken);
  }

  return url.toString();
}

function parseSocketEvent(data: unknown): ConsultingServerSocketEvent | null {
  if (typeof data !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as {type?: unknown};
    return typeof parsed.type === 'string' ? (parsed as ConsultingServerSocketEvent) : null;
  } catch {
    return null;
  }
}

export function connectConsultingConversationSocket({
  authToken,
  bookingId,
  onEvent,
  onStatusChange,
  participantType = 'user',
}: ConnectConsultingConversationSocketOptions): ConsultingConversationSocketClient {
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let closedByClient = false;

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const setStatus = (status: ConsultingSocketStatus) => {
    onStatusChange?.(status);
  };

  const clearHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
      heartbeatTimeout = null;
    }
  };

  const sendHeartbeat = () => {
    const currentSocket = socket;
    if (!currentSocket || currentSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    currentSocket.send(JSON.stringify({at: new Date().toISOString(), type: 'ping'}));
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
    }
    heartbeatTimeout = setTimeout(() => {
      if (socket === currentSocket && currentSocket.readyState === WebSocket.OPEN) {
        currentSocket.close();
      }
    }, HEARTBEAT_TIMEOUT_MS);
  };

  const startHeartbeat = () => {
    clearHeartbeat();
    sendHeartbeat();
    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  };

  const connect = () => {
    clearReconnectTimer();
    setStatus(reconnectAttempt === 0 ? 'connecting' : 'reconnecting');

    let nextSocket: WebSocket;
    try {
      nextSocket = new WebSocket(
        buildConsultingWebSocketUrl({
          authToken,
          bookingId,
          participantType,
        }),
      );
      socket = nextSocket;
    } catch {
      scheduleReconnect();
      return;
    }

    nextSocket.onopen = () => {
      if (socket !== nextSocket) {
        return;
      }
      reconnectAttempt = 0;
      setStatus('connected');
      startHeartbeat();
    };

    nextSocket.onmessage = event => {
      if (socket !== nextSocket) {
        return;
      }
      const parsed = parseSocketEvent(event.data);

      if (parsed) {
        if (parsed.type === 'pong' && heartbeatTimeout) {
          clearTimeout(heartbeatTimeout);
          heartbeatTimeout = null;
        }
        onEvent(parsed);
      }
    };

    nextSocket.onerror = () => {
      if (!closedByClient && socket === nextSocket) {
        setStatus('offline');
      }
    };

    nextSocket.onclose = () => {
      if (socket !== nextSocket) {
        return;
      }
      socket = null;
      clearHeartbeat();

      if (closedByClient) {
        setStatus('idle');
        return;
      }

      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    clearReconnectTimer();
    reconnectAttempt += 1;
    setStatus('reconnecting');
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * 2 ** Math.max(0, reconnectAttempt - 1),
      MAX_RECONNECT_DELAY_MS,
    );
    reconnectTimer = setTimeout(connect, delay);
  };

  const send = (event: ConsultingClientSocketEvent): boolean => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify(event));
    return true;
  };

  const reconnect = () => {
    if (closedByClient) {
      return;
    }
    reconnectAttempt = 0;
    clearReconnectTimer();
    clearHeartbeat();
    const previousSocket = socket;
    socket = null;
    if (previousSocket) {
      previousSocket.onerror = null;
      previousSocket.onclose = null;
      previousSocket.close();
    }
    connect();
  };

  connect();
  const unsubscribeFromAppResume = subscribeToAppResume(reconnect);

  return {
    close: () => {
      closedByClient = true;
      clearReconnectTimer();
      clearHeartbeat();
      unsubscribeFromAppResume();
      socket?.close();
      socket = null;
      setStatus('idle');
    },
    reconnect,
    send,
    sendMessage: payload =>
      send({
        ...payload,
        type: 'message.send',
      }),
    sendRead: currentBookingId =>
      send({
        bookingId: currentBookingId,
        readAt: new Date().toISOString(),
        type: 'read',
      }),
    sendTyping: (currentBookingId, isTyping) =>
      send({
        bookingId: currentBookingId,
        isTyping,
        type: 'typing',
      }),
  };
}
