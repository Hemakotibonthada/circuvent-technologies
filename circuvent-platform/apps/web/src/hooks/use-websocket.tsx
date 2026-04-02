// ──────────────────────────────────────────────────────────────
// WebSocket Client Hook — React hook for real-time
// subscriptions to the Circuvent WS server.
// ──────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "./use-auth";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3000/ws";

interface WSMessage<T = unknown> {
  channel: string;
  event: string;
  data: T;
  timestamp: string;
}

type MessageHandler<T = unknown> = (message: WSMessage<T>) => void;

interface UseWebSocketOptions {
  channels?: string[];
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  lastMessage: WSMessage | null;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  publish: (channel: string, data: unknown) => void;
  onMessage: (channel: string, handler: MessageHandler) => () => void;
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { token } = useAuth();
  const {
    channels = [],
    autoConnect = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("disconnected");

  const connect = useCallback(() => {
    if (!token) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus("connecting");
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setConnectionStatus("connected");
      reconnectCountRef.current = 0;

      // Subscribe to initial channels
      for (const ch of channels) {
        ws.send(JSON.stringify({ type: "subscribe", channel: ch }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        setLastMessage(msg);

        // Dispatch to channel handlers
        if (msg.channel) {
          const handlers = handlersRef.current.get(msg.channel);
          if (handlers) {
            for (const handler of handlers) {
              handler(msg);
            }
          }
        }

        // Also dispatch to wildcard handlers
        const wildcardHandlers = handlersRef.current.get("*");
        if (wildcardHandlers) {
          for (const handler of wildcardHandlers) {
            handler(msg);
          }
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setConnectionStatus("disconnected");

      if (reconnectCountRef.current < maxReconnectAttempts) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectCountRef.current++;
          connect();
        }, reconnectInterval);
      }
    };

    ws.onerror = () => {
      setConnectionStatus("error");
    };
  }, [token, channels, reconnectInterval, maxReconnectAttempts]);

  useEffect(() => {
    if (autoConnect && token) {
      connect();
    }

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [autoConnect, token, connect]);

  const subscribe = useCallback((channel: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "subscribe", channel }));
    }
  }, []);

  const unsubscribe = useCallback((channel: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "unsubscribe", channel }));
    }
  }, []);

  const publish = useCallback((channel: string, data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "publish", channel, data }));
    }
  }, []);

  const onMessage = useCallback((channel: string, handler: MessageHandler): (() => void) => {
    if (!handlersRef.current.has(channel)) {
      handlersRef.current.set(channel, new Set());
    }
    handlersRef.current.get(channel)!.add(handler);

    return () => {
      handlersRef.current.get(channel)?.delete(handler);
    };
  }, []);

  return {
    isConnected,
    lastMessage,
    subscribe,
    unsubscribe,
    publish,
    onMessage,
    connectionStatus,
  };
}
