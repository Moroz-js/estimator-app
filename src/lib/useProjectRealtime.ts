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
  const presenceUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onRemotePatchRef = useRef(onRemotePatch);
  const isInitializedRef = useRef(false);

  // Обновляем ref при изменении callback
  useEffect(() => {
    onRemotePatchRef.current = onRemotePatch;
  }, [onRemotePatch]);

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
    if (!currentUser.id || !projectId) return;

    const channelName = `project:${projectId}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });

    // Обработка presence sync с debounce
    channel.on("presence", { event: "sync" }, () => {
      // Очищаем предыдущий таймер
      if (presenceUpdateTimeoutRef.current) {
        clearTimeout(presenceUpdateTimeoutRef.current);
      }

      // Обновляем presence с задержкой, чтобы избежать мигания
      presenceUpdateTimeoutRef.current = setTimeout(() => {
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

        // Обновляем только если список действительно изменился
        setPresenceList((prev) => {
          if (prev.length !== users.length) return users;
          
          const prevIds = prev.map(u => u.userId).sort().join(',');
          const newIds = users.map(u => u.userId).sort().join(',');
          
          if (prevIds !== newIds) return users;
          
          return prev;
        });
      }, 500); // Задержка 500мс для группировки быстрых изменений
    });

    // Обработка broadcast сообщений
    channel.on("broadcast", { event: "patch" }, ({ payload }) => {
      const message = payload as RealtimeMessage;

      // Игнорируем свои собственные сообщения
      if (message.clientId === clientIdRef.current) {
        return;
      }

      onRemotePatchRef.current(message);
    });

    // Подписка на канал
    channel
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Сразу устанавливаем connected без задержки
          setIsConnected(true);
          reconnectAttemptsRef.current = 0;

          // Отправляем начальное presence
          await channel.track(myPresenceRef.current);
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          // Не сразу показываем offline, даём время на переподключение
          if (connectionStableTimeoutRef.current) {
            clearTimeout(connectionStableTimeoutRef.current);
          }
          
          connectionStableTimeoutRef.current = setTimeout(() => {
            setIsConnected(false);
          }, 3000); // Увеличили до 3 сек
          
          handleReconnect();
        }
      });

    channelRef.current = channel;
  }, [enabled, projectId, currentUser.id, currentUser.email]);

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
    // Подключаемся только один раз
    if (!isInitializedRef.current && enabled && currentUser.id && projectId) {
      isInitializedRef.current = true;
      connectChannel();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (connectionStableTimeoutRef.current) {
        clearTimeout(connectionStableTimeoutRef.current);
      }

      if (presenceUpdateTimeoutRef.current) {
        clearTimeout(presenceUpdateTimeoutRef.current);
      }

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, [connectChannel, enabled, currentUser.id, projectId]);

  return {
    presenceList,
    sendPatch,
    updatePresence,
    isConnected,
  };
}
