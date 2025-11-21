"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import EstimatorApp from "@/components/EstimatorApp";
import { supabase } from "@/lib/supabaseClient";
import type { AppState, Epic, Subtask } from "@/lib/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeAppState(raw: any): AppState {
  const safeProject = {
    name: raw?.project?.name ?? "",
    date: raw?.project?.date ?? today(),
    type: raw?.project?.type === "Mobile" ? "Mobile" : "Web",
    stack: Array.isArray(raw?.project?.stack) ? raw.project.stack : [],
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

  useEffect(() => {
    if (!projectId) return;

    const load = async () => {
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

        const { data, error } = await supabase
          .from("projects")
          .select("payload")
          .eq("id", projectId)
          .single();

        if (error) throw error;
        if (!data?.payload) throw new Error("Проект не найден");

        const normalized = normalizeAppState(data.payload as any);
        setInitialState(normalized);
      } catch (e: any) {
        setError(e?.message || "Не удалось загрузить проект");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [projectId, router]);

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

  return <EstimatorApp initialState={initialState} onSave={handleSave} onClose={handleClose} projectId={projectId} />;
}
