"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { AppState, Epic } from "@/lib/types";

function normalizeAppState(raw: any): AppState {
  const safeProject = {
    name: raw?.project?.name ?? "",
    date: raw?.project?.date ?? new Date().toISOString().slice(0, 10),
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

export default function ProjectPreviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params?.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<AppState | undefined>(undefined);

  useEffect(() => {
    if (!projectId) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Загружаем проект БЕЗ авторизации - если знаешь ID, можешь смотреть
        const { data, error } = await supabase
          .from("projects")
          .select("payload")
          .eq("id", projectId)
          .single();

        if (error) throw error;
        if (!data?.payload) throw new Error("Проект не найден");

        const normalized = normalizeAppState(data.payload as any);
        setState(normalized);
      } catch (e: any) {
        setError(e?.message || "Не удалось загрузить проект");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [projectId, router]);

  if (!projectId) {
    return <div className="viewport">Некорректный идентификатор проекта</div>;
  }

  if (loading) {
    return (
      <div className="viewport">
        <div className="card" style={{ width: "100%", maxWidth: 480 }}>
          <div className="card-header">
            <h2>Загрузка превью...</h2>
          </div>
        </div>
      </div>
    );
  }

  if (error || !state) {
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

  const totalHours = state.epics.reduce((acc, epic) => {
    return acc + epic.tasks.reduce((sum, task) => {
      return sum + (typeof task.estimate === "number" ? task.estimate : 0);
    }, 0);
  }, 0);

  const hoursByType = state.epics.reduce((acc, epic) => {
    epic.tasks.forEach(task => {
      const hours = typeof task.estimate === "number" ? task.estimate : 0;
      if (task.type === "BA") acc.BA += hours;
      else if (task.type === "NC") acc.NC += hours;
      else if (task.type === "DE") acc.DE += hours;
    });
    return acc;
  }, { BA: 0, NC: 0, DE: 0 });

  return (
    <div className="viewport">
      <div style={{ width: "100%", maxWidth: 1280 }}>
        <div className="card animate-in" style={{ width: "100%", marginBottom: 16 }}>
          <div className="card-header">
            <h2>{state.project.name}</h2>
            <div className="small" style={{ color: "#64748b" }}>Превью проекта (только для чтения)</div>
          </div>

          <div className="grid" style={{ marginBottom: 24, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div>
              <div className="small" style={{ color: "#64748b", marginBottom: 4 }}>Тип проекта</div>
              <div>{state.project.type}</div>
            </div>
            <div>
              <div className="small" style={{ color: "#64748b", marginBottom: 4 }}>Язык</div>
              <div>{state.project.language === "en" ? "English" : "Русский"}</div>
            </div>
            <div>
              <div className="small" style={{ color: "#64748b", marginBottom: 4 }}>Дата</div>
              <div>{state.project.date}</div>
            </div>
            <div>
              <div className="small" style={{ color: "#64748b", marginBottom: 4 }}>Стек</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {state.project.stack.map((tech) => (
                  <span
                    key={tech}
                    className="small"
                    style={{
                      background: "#f1f5f9",
                      padding: "4px 8px",
                      borderRadius: 6,
                      color: "#475569"
                    }}
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="small" style={{ color: "#64748b", marginBottom: 4 }}>Оценка времени</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span className="small">BA: {hoursByType.BA} ч</span>
                <span className="small">NC: {hoursByType.NC} ч</span>
                <span className="small">DE: {hoursByType.DE} ч</span>
                <span className="small" style={{ fontWeight: 600 }}>Всего: {totalHours} ч</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card animate-in" style={{ width: "100%" }}>
          <h3 style={{ marginBottom: 16 }}>Эпики и задачи</h3>
          {state.epics.map((epic, epicIndex) => {
            const epicTotal = epic.tasks.reduce((sum, task) => {
              return sum + (typeof task.estimate === "number" ? task.estimate : 0);
            }, 0);

            return (
              <div
                key={epic.id}
                style={{
                  marginBottom: 16,
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    background: "#f8fafc",
                    padding: "12px 16px",
                    borderBottom: "1px solid #e2e8f0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {epicIndex + 1}. {epic.title}
                  </div>
                  <div className="small" style={{ color: "#64748b" }}>
                    {epicTotal} ч
                  </div>
                </div>
                <div style={{ padding: "8px 0" }}>
                  {epic.tasks.map((task, taskIndex) => (
                    <div
                      key={task.id}
                      style={{
                        padding: "8px 16px",
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        borderBottom: taskIndex < epic.tasks.length - 1 ? "1px solid #f1f5f9" : "none"
                      }}
                    >
                      <span
                        className="small"
                        style={{
                          background: task.type === "BA" ? "#dbeafe" : task.type === "NC" ? "#fef3c7" : "#dcfce7",
                          color: task.type === "BA" ? "#1e40af" : task.type === "NC" ? "#92400e" : "#166534",
                          padding: "2px 8px",
                          borderRadius: 4,
                          minWidth: 40,
                          textAlign: "center",
                          fontWeight: 500
                        }}
                      >
                        {task.type || "—"}
                      </span>
                      <div style={{ flex: 1 }}>{task.title}</div>
                      <div className="small" style={{ color: "#64748b", minWidth: 50, textAlign: "right" }}>
                        {task.estimate ? `${task.estimate} ч` : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 24, textAlign: "center" }}>
            <button className="btn" type="button" onClick={() => router.push("/")}>
              Вернуться к проектам
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
