import { useEffect, useRef, useState, useCallback } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import type { PresencePayload, RealtimeMessage } from "./types";
import { generateClientId, generateUserColor } from "./realtimeUtils";

interface UseProjectRealtimeOptions {
  projectId: string;
  currentUser: {
    id: string;
    email: string;
    displayName?: string;
  };
  onRemotePatch: (message: RealtimeMessage) => void;
  enabled?: boolean;
}

interface UseProjectRealtimeReturn {
  presenceList: PresencePayload[];
  sendPatch: (message: Omit<RealtimeMessage, "clientId" | "userId" | "timestamp">) => void;
  updatePresence: (patch: Partial<Omit<PresencePayload, "userId" | "email" | "color" | "joinedAt">>) => void;
  isConnected: boolean;
}

export function useProjectRealtime(
  options: UseProjectRealtimeOptions
): UseProjectRealtimeReturn {
  const { projectId, currentUser, onRemotePatch, enabled = true } = options;

  const [presenceList, setPresenceList] = useState<PresencePayload[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const clientIdRef = useRef<string>(generateClientId());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const connectionStableTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const myPresenceRef = useRef<PresencePayload>({
    userId: currentUser.id,
    email: currentUser.email,
    displayName: currentUser.displayName,
    color: generateUserColor(currentUser.id),
    joinedAt: new Date().toISOString(),
  });

  // Отправка patch-сообщения
  const sendPatch = useCallback(
    (message: Omit<RealtimeMessage, "clientId" | "userId" | "timestamp">) => {
      if (!channelRef.current || !isConnected) return;

      const fullMessage: RealtimeMessage = {
        ...message,
        clientId: clientIdRef.current,
        userId: currentUser.id,
        timestamp: Date.now(),
      } as RealtimeMessage;

      channelRef.current.send({
        type: "broadcast",
        event: "patch",
        payload: fullMessage,
      });
    },
    [currentUser.id, isConnected]
  );

  // Обновление presence
  const updatePresence = useCallback(
    (patch: Partial<Omit<PresencePayload, "userId" | "email" | "color" | "joinedAt">>) => {
      if (!channelRef.current) return;

      myPresenceRef.current = {
        ...myPresenceRef.current,
        ...patch,
      };

      channelRef.current.track(myPresenceRef.current);
    },
    []
  );

  // Подключение к каналу
  const connectChannel = useCallback(() => {
    if (!enabled) return;

    const channelName = `project:${projectId}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });

    // Обработка presence sync
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const users: PresencePayload[] = [];

      Object.keys(state).forEach((key) => {
        const presences = state[key] as any[];
        if (presences && presences.length > 0) {
          const presence = presences[0] as PresencePayload;
          // Проверяем что это валидный PresencePayload
          if (presence.userId && presence.email) {
            users.push(presence);
          }
        }
      });

      setPresenceList(users);
    });

    // Обработка broadcast сообщений
    channel.on("broadcast", { event: "patch" }, ({ payload }) => {
      const message = payload as RealtimeMessage;

      // Игнорируем свои собственные сообщения
      if (message.clientId === clientIdRef.current) {
        return;
      }

      onRemotePatch(message);
    });

    // Подписка на канал
    channel
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Debounce для isConnected - устанавливаем только если соединение стабильно 1 сек
          if (connectionStableTimeoutRef.current) {
            clearTimeout(connectionStableTimeoutRef.current);
          }
          
          connectionStableTimeoutRef.current = setTimeout(() => {
            setIsConnected(true);
            reconnectAttemptsRef.current = 0;
          }, 1000);

          // Отправляем начальное presence
          await channel.track(myPresenceRef.current);
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          // Не сразу показываем offline, даём время на переподключение
          if (connectionStableTimeoutRef.current) {
            clearTimeout(connectionStableTimeoutRef.current);
          }
          
          connectionStableTimeoutRef.current = setTimeout(() => {
            setIsConnected(false);
          }, 2000);
          
          handleReconnect();
        }
      });

    channelRef.current = channel;
  }, [enabled, projectId, currentUser.id, onRemotePatch]);

  // Реконнект с экспоненциальным backoff
  const handleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const attempt = reconnectAttemptsRef.current;
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // макс 30 сек

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttemptsRef.current += 1;
      
      // Отключаем старый канал
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      // Переподключаемся
      connectChannel();
    }, delay);
  }, [connectChannel]);

  // Инициализация при монтировании
  useEffect(() => {
    connectChannel();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (connectionStableTimeoutRef.current) {
        clearTimeout(connectionStableTimeoutRef.current);
      }

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [connectChannel]);

  return {
    presenceList,
    sendPatch,
    updatePresence,
    isConnected,
  };
}
