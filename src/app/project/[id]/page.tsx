"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import EstimatorApp from "@/components/EstimatorApp";
import { ProjectCollabProvider } from "@/components/ProjectCollabProvider";
import { supabase } from "@/lib/supabaseClient";
import { applyRemotePatch } from "@/lib/realtimePatchHandler";
import type { AppState, Epic, Subtask, RealtimeMessage } from "@/lib/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeAppState(raw: any): AppState {
  const safeProject = {
    name: raw?.project?.name ?? "",
    date: raw?.project?.date ?? today(),
    type: raw?.project?.type === "Mobile" ? "Mobile" : "Web",
    stack: Array.isArray(raw?.project?.stack) ? raw.project.stack : [],
    language: (raw?.project?.language === "ru" ? "ru" : "en"),
  } as AppState["project"];

  const safeEpics: Epic[] = Array.isArray(raw?.epics)
    ? raw.epics.map((e: any) => ({
        id: typeof e?.id === "string" ? e.id : `epic_${Math.random().toString(36).slice(2, 8)}`,
        title: e?.title ?? "",
        tasks: Array.isArray(e?.tasks)
          ? e.tasks.map((t: any) => ({
              id: typeof t?.id === "string" ? t.id : `t_${Math.random().toString(36).slice(2, 8)}`,
              type: (t?.type === "BA" || t?.type === "NC" || t?.type === "DE" || t?.type === "") ? t.type : "",
              title: t?.title ?? "",
              estimate: typeof t?.estimate === "number" && !Number.isNaN(t.estimate) ? t.estimate : undefined,
              comment: typeof t?.comment === "string" ? t.comment : "",
            }))
          : [],
      }))
    : [];

  return {
    project: safeProject,
    epics: safeEpics,
  };
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params?.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialState, setInitialState] = useState<AppState | undefined>(undefined);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [isOwner, setIsOwner] = useState(false);

  // Ref для хранения актуального состояния (для realtime патчей)
  const stateRef = useRef<AppState | undefined>(undefined);
  const setStateCallback = useRef<((state: AppState) => void) | null>(null);

  // Timestamps для разрешения конфликтов
  const timestampsRef = useRef({
    projectMeta: Date.now(),
    epics: new Map<string, number>(),
    tasks: new Map<string, number>(),
  });

  // Мемоизируем currentUser чтобы не пересоздавать объект (должно быть до условных return)
  const currentUser = useMemo(() => ({
    id: currentUserId || "",
    email: currentUserEmail,
  }), [currentUserId, currentUserEmail]);

  // Обработчик remote патчей (должен быть до условных return)
  const handleRemotePatch = useCallback((message: RealtimeMessage) => {
    if (!stateRef.current || !setStateCallback.current) return;

    const newState = applyRemotePatch(
      stateRef.current,
      message,
      timestampsRef.current
    );

    if (newState) {
      stateRef.current = newState;
      setStateCallback.current(newState);
    }
  }, []);

  // Функция загрузки проекта
  const loadProject = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/");
        return;
      }

      setCurrentUserId(session.user.id);
      setCurrentUserEmail(session.user.email || "");

      const { data, error } = await supabase
        .from("projects")
        .select("payload, owner_id")
        .eq("id", projectId)
        .single();

      if (error) throw error;
      if (!data?.payload) throw new Error("Проект не найден");

      // Проверяем, является ли пользователь владельцем
      setIsOwner(data.owner_id === session.user.id);

      const normalized = normalizeAppState(data.payload as any);
      setInitialState(normalized);
      
      // Обновляем timestamps при загрузке
      const now = Date.now();
      timestampsRef.current.projectMeta = now;
      normalized.epics.forEach((epic) => {
        timestampsRef.current.epics.set(epic.id, now);
        epic.tasks.forEach((task) => {
          timestampsRef.current.tasks.set(task.id, now);
        });
      });
    } catch (e: any) {
      setError(e?.message || "Не удалось загрузить проект");
    } finally {
      setLoading(false);
    }
  }, [projectId, router]);

  // Загрузка при монтировании
  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Перезагрузка при возвращении на вкладку
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !loading) {
        loadProject();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadProject, loading]);

  const handleSave = async (state: AppState) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw new Error("Сессия истекла, перезайдите");
    }

    const { error } = await supabase
      .from("projects")
      .update({
        name: state.project.name || "Без названия",
        payload: state,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    if (error) throw error;
    // Остаёмся на странице после сохранения
  };

  if (!projectId) {
    return <div className="viewport">Некорректный идентификатор проекта</div>;
  }

  if (loading) {
    return (
      <div className="viewport">
        <div className="card" style={{ width: "100%", maxWidth: 480 }}>
          <div className="card-header">
            <h2>Загрузка проекта...</h2>
          </div>
        </div>
      </div>
    );
  }

  if (error || !initialState) {
    return (
      <div className="viewport">
        <div className="card" style={{ width: "100%", maxWidth: 480 }}>
          <div className="card-header">
            <h2>Ошибка</h2>
          </div>
          <div className="grid">
            <div className="small" style={{ color: "#ef4444" }}>
              {error || "Проект не найден"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleClose = () => {
    router.replace("/");
  };

  // Если нет currentUserId или email, не показываем realtime
  const realtimeEnabled = !!(currentUserId && currentUserEmail && projectId);

  return (
    <ProjectCollabProvider
      projectId={projectId || ""}
      currentUser={currentUser}
      onRemotePatch={handleRemotePatch}
      enabled={realtimeEnabled}
    >
      <EstimatorApp
        initialState={initialState}
        onSave={handleSave}
        onClose={handleClose}
        projectId={projectId}
        currentUserId={currentUserId || undefined}
        isOwner={isOwner}
        onStateChange={(newState) => {
          stateRef.current = newState;
        }}
        onSetStateCallback={(callback) => {
          setStateCallback.current = callback;
        }}
      />
    </ProjectCollabProvider>
  );
}
