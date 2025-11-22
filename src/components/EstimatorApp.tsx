"use client";
import EpicEditor from "@/components/EpicEditor";
import StackMultiSelect from "@/components/StackMultiSelect";
import YAMLPreview from "@/components/YAMLPreview";
import InviteModal from "@/components/InviteModal";
import ProjectMembers from "@/components/ProjectMembers";
import { UserAvatarGroup } from "@/components/UserAvatar";
import { useProjectCollab } from "@/components/ProjectCollabProvider";
import ConfirmModal from "@/components/ConfirmModal";
import AlertModal from "@/components/AlertModal";
import { AppState, Epic, SubtaskType, ProjectLanguage } from "@/lib/types";
import { generateYaml } from "@/lib/yaml";
import jsyaml from "js-yaml";
import { ChangeEvent, useEffect, useRef, useState, useCallback } from "react";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

const WEB_PRESETS = ["Weweb", "Webflow", "Supabase", "Figma"] as const;
const MOBILE_PRESETS = ["Flutterflow", "Firebase", "Supabase"] as const;
const isDb = (x: string) => x === "Firebase" || x === "Supabase";
function presetsByType(type: "Web" | "Mobile"): string[] {
  return type === "Web" ? [...WEB_PRESETS] : [...MOBILE_PRESETS];
}

type TaskField = "type" | "title" | "estimate";
type ValidationMap = Record<string, { epicTitle?: boolean; noTasks?: boolean; tasks?: Record<string, Partial<Record<TaskField, boolean>>> }>;

type EstimatorAppProps = {
  initialState?: AppState;
  onSave?: (state: AppState) => Promise<void> | void;
  onClose?: () => void;
  projectId?: string;
  currentUserId?: string;
  isOwner?: boolean;
  // Realtime callbacks
  onStateChange?: (state: AppState) => void;
  onSetStateCallback?: (callback: (state: AppState) => void) => void;
};

export default function EstimatorApp({ 
  initialState, 
  onSave, 
  onClose, 
  projectId, 
  currentUserId, 
  isOwner = true,
  onStateChange,
  onSetStateCallback,
}: EstimatorAppProps) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [yaml, setYaml] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  
  // Модальные окна
  const [alertModal, setAlertModal] = useState<{ title: string; message: string; type?: "success" | "error" | "info" } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void; danger?: boolean } | null>(null);
  const [state, setState] = useState<AppState>(
    initialState ?? {
      project: {
        name: "",
        date: today(),
        type: "Web" as const,
        stack: [],
        language: "en" as const,
      },
      epics: [],
    } as AppState
  );
  const lastDefaultsSig = useRef<string | null>(null);
  const [errors, setErrors] = useState<ValidationMap | null>(null);

  const initialRef = useRef<AppState | null>(null);
  const dirtyRef = useRef(false);

  // Realtime collaboration
  let collab: ReturnType<typeof useProjectCollab> | null = null;
  try {
    collab = useProjectCollab();
  } catch {
    // Если не в контексте ProjectCollabProvider, collab будет null
  }

  // Debounce для isTyping
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Обёртка setState для уведомления о изменениях
  const setStateWithNotify = useCallback((newState: AppState | ((prev: AppState) => AppState)) => {
    setState((prev) => {
      const next = typeof newState === "function" ? newState(prev) : newState;
      onStateChange?.(next);
      return next;
    });
  }, [onStateChange]);

  // Передаём callback для внешнего обновления состояния (для remote патчей)
  useEffect(() => {
    if (onSetStateCallback) {
      onSetStateCallback(setStateWithNotify);
    }
  }, [onSetStateCallback, setStateWithNotify]);

  useEffect(() => {
    if (initialState) {
      setStateWithNotify(initialState);
      initialRef.current = initialState;
      dirtyRef.current = false;
      
      // Если проект уже заполнен (имя и стек), открываем сразу шаг 2 (эпики)
      if (initialState.project.name && initialState.project.stack.length > 0) {
        setStep(2);
      }
    }
  }, [initialState, setStateWithNotify]);

  useEffect(() => {
    if (!initialState && !initialRef.current) {
      initialRef.current = state;
      dirtyRef.current = false;
    }
  }, [initialState, state]);

  useEffect(() => {
    if (!initialRef.current) return;
    const isDirty = JSON.stringify(state) !== JSON.stringify(initialRef.current);
    dirtyRef.current = isDirty;
  }, [state]);

  const canNext = state.project.name.trim().length > 0;

  const updateProject = <K extends keyof AppState["project"]>(key: K, val: AppState["project"][K]) => {
    setStateWithNotify((s: AppState) => ({ ...s, project: { ...s.project, [key]: val } }));
    
    // Отправляем realtime патч
    if (collab && projectId) {
      const payload: Partial<AppState["project"]> = { [key]: val } as any;
      collab.sendPatch({
        type: "project_meta_update" as const,
        payload,
      } as any);
    }
  };

  const applyFrontendToExistingEpics = (frontend: "Weweb" | "Webflow") => {
    setStateWithNotify((s) => {
      if (s.epics.length === 0) return s as AppState;
      const updated = s.epics.map((e) => {
        if (e.title !== "Initialization") return e;
        return {
          ...e,
          tasks: e.tasks.map((t) =>
            /^UI kit & components in\s+/i.test(t.title)
              ? { ...t, title: `UI kit & components in ${frontend}` }
              : t
          ),
        };
      });
      return { ...s, epics: updated } as AppState;
    });
  };

  const applyBackendToExistingEpics = (backend: "Firebase" | "Supabase") => {
    setStateWithNotify((s) => {
      if (s.epics.length === 0) return s;
      const updated = s.epics.map((e) => {
        if (e.title !== "Initialization") return e;
        return {
          ...e,
          tasks: e.tasks.map((t) =>
            t.title === "Firebase setup" || t.title === "Supabase setup"
              ? { ...t, title: `${backend} setup` }
              : t
          ),
        };
      });
      return { ...s, epics: updated } as AppState;
    });
    const isMobile = state.project.type === "Mobile";
    lastDefaultsSig.current = `${isMobile ? 'mobile' : 'web'}|${backend}`;
  };

  const updateEpics = (epics: Epic[]) => setStateWithNotify((s: AppState) => ({ ...s, epics }));

  const validate = (epics: Epic[]): ValidationMap => {
    const out: ValidationMap = {};
    epics.forEach((e) => {
      let epicHas = false;
      const taskMap: Record<string, Partial<Record<TaskField, boolean>>> = {};
      const titleInvalid = (e.title || "").trim().length === 0;
      if (titleInvalid) { epicHas = true; }
      const noTasks = e.tasks.length === 0;
      if (noTasks) { epicHas = true; }
      e.tasks.forEach((t) => {
        const tErr: Partial<Record<TaskField, boolean>> = {};
        if ((t.type as any) === "") tErr.type = true;
        if ((t.title || "").trim().length === 0) tErr.title = true;
        if (t.estimate === undefined || t.estimate === null || Number.isNaN(t.estimate)) tErr.estimate = true;
        if (Object.keys(tErr).length) {
          taskMap[t.id] = tErr;
          epicHas = true;
        }
      });
      if (epicHas) out[e.id] = { epicTitle: titleInvalid, noTasks, tasks: taskMap };
    });
    return out;
  };

  const onGenerate = async () => {
    const v = validate(state.epics);
    const hasErrors = Object.keys(v).length > 0;
    if (hasErrors) {
      setErrors(v);
      return;
    }
    setErrors(null);
    try {
      setDownloading(true);
      const body = generateYaml(state);
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "bypass-tunnel-reminder": "true" },
        body,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const cd = res.headers.get("content-disposition") || "";
      const m = cd.match(/filename="?([^";]+)"?/i);
      const filename = m ? decodeURIComponent(m[1]) : "Estimate.xlsx";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e:any) {
      setAlertModal({
        title: "Ошибка",
        message: `Не удалось получить XLSX: ${e?.message || e}`,
        type: "error",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(state);
      // Сбрасываем индикатор несохранённых изменений на текущий снимок
      initialRef.current = state;
      dirtyRef.current = false;
    } catch (e: any) {
      setAlertModal({
        title: "Ошибка",
        message: e?.message || "Не удалось сохранить проект",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCloseClick = () => {
    if (!onClose) return;
    if (dirtyRef.current) {
      setConfirmModal({
        title: "Несохранённые изменения",
        message: "Есть несохранённые изменения. Точно закрыть?",
        onConfirm: onClose,
        danger: true,
      });
    } else {
      onClose();
    }
  };

  const handleInviteClick = () => {
    if (!projectId) {
      setAlertModal({
        title: "Проект не сохранён",
        message: "Сначала сохраните проект",
        type: "info",
      });
      return;
    }
    setInviteModalOpen(true);
  };

  const handleInviteSubmit = async (email: string) => {
    setInviting(true);
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error("Сессия истекла, перезайдите");
      }

      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          projectId, 
          email,
          accessToken: session.access_token 
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Не удалось пригласить пользователя");
      }
      
      setAlertModal({
        title: "Успешно",
        message: "Пользователь успешно приглашён!",
        type: "success",
      });
    } catch (e: any) {
      setAlertModal({
        title: "Ошибка",
        message: e?.message || "Не удалось пригласить пользователя",
        type: "error",
      });
      throw e;
    } finally {
      setInviting(false);
    }
  };

  const handleShare = async () => {
    if (!projectId) {
      setAlertModal({
        title: "Проект не сохранён",
        message: "Сначала сохраните проект",
        type: "info",
      });
      return;
    }
    
    const fullUrl = `${window.location.origin}/project/${projectId}/preview`;
    await navigator.clipboard.writeText(fullUrl);
    setAlertModal({
      title: "Успешно",
      message: "Ссылка скопирована в буфер обмена!",
      type: "success",
    });
  };

  const handleDeleteProject = () => {
    if (!projectId) return;

    setConfirmModal({
      title: "Удалить проект?",
      message: "Вы уверены, что хотите удалить этот проект? Это действие нельзя отменить.",
      onConfirm: async () => {
        try {
          const { supabase } = await import("@/lib/supabaseClient");
          const { data: { session } } = await supabase.auth.getSession();
          
          if (!session?.access_token) {
            throw new Error("Сессия истекла, перезайдите");
          }

          const res = await fetch("/api/delete-project", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, accessToken: session.access_token }),
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Не удалось удалить проект");
          }

          setAlertModal({
            title: "Успешно",
            message: "Проект удалён",
            type: "success",
          });

          // Закрываем через секунду
          setTimeout(() => {
            if (onClose) onClose();
          }, 1000);
        } catch (e: any) {
          setAlertModal({
            title: "Ошибка",
            message: e?.message || "Не удалось удалить проект",
            type: "error",
          });
        }
      },
      danger: true,
    });
  };

  const currentPresets = presetsByType(state.project.type);
  const setTypeAndFilterStack = (type: "Web" | "Mobile") => {
    setStateWithNotify((s) => {
      const customs = s.project.stack.filter((x) => x.startsWith("Custom:"));
      const filteredPresets = s.project.stack.filter((x) => currentPresets.includes(x));
      const nextPresets = presetsByType(type);
      const preserved = [...customs, ...filteredPresets.filter((x) => nextPresets.includes(x))];
      return { ...s, project: { ...s.project, type, stack: preserved } } as AppState;
    });
  };

  type TemplateTask = { type: SubtaskType; title: string; estimate?: number };
  type TemplateEpic = { title: string; tasks: TemplateTask[] };
  type DefaultsYaml = {
    mobile?: TemplateEpic[];
    web?: TemplateEpic[];
    integrations?: TemplateEpic[];
    webflow?: TemplateEpic[];
    weweb?: TemplateEpic[];
    flutterflow?: TemplateEpic[];
  };

  const buildDefaultEpics = async (): Promise<Epic[]> => {
    const res = await fetch("/defaults.yaml", { cache: "no-store" });
    const text = await res.text();
    const parsed = jsyaml.load(text) as DefaultsYaml;

    const isMobile = state.project.type === "Mobile";
    const wantsWebflow = state.project.stack.includes("Webflow");
    const wantsWeweb = state.project.stack.includes("Weweb");
    const setKey = isMobile
      ? (parsed.flutterflow ? "flutterflow" : "mobile")
      : (wantsWebflow && (parsed as any).webflow ? "webflow" : (parsed as any).weweb ? "weweb" : "web");
    const backend = state.project.stack.includes("Firebase")
      ? "Firebase"
      : state.project.stack.includes("Supabase")
      ? "Supabase"
      : "Supabase";

    const baseList: TemplateEpic[] = [...((parsed as any)[setKey] || [])];
    const integrations: TemplateEpic[] = parsed.integrations || [];
    if (setKey === "mobile" || setKey === "flutterflow") {
      const pubIdx = baseList.findIndex((e) =>
        e.title === "AppStore & GooglePlay publishing" || e.title === "AppStore & GooglePlay deploy"
      );
      const before = pubIdx >= 0 ? baseList.slice(0, pubIdx) : baseList;
      const after = pubIdx >= 0 ? baseList.slice(pubIdx) : [];
      var merged: TemplateEpic[] = [...before, ...integrations, ...after];
    } else {
      var merged: TemplateEpic[] = [...baseList, ...integrations];
    }
    let epics: Epic[] = merged.map((e) => ({
      id: uid("epic"),
      title: e.title,
      tasks: e.tasks.map((t) => ({
        id: uid("t"),
        type: t.type,
        title: t.title.replace("{{BACKEND}}", backend),
        estimate: t.estimate,
        comment: "",
      })),
    }));

    return epics;
  };

  const proceedToEpics = async () => {
    const isMobile = state.project.type === "Mobile";
    const backend = state.project.stack.includes("Firebase")
      ? "Firebase"
      : state.project.stack.includes("Supabase")
      ? "Supabase"
      : "Supabase";
    const sig = `${isMobile ? "mobile" : "web"}|${backend}`;

    if (state.epics.length === 0) {
      const defaults = await buildDefaultEpics();
      setStateWithNotify((s) => ({ ...s, epics: defaults }));
      lastDefaultsSig.current = sig;
      setStep(2);
      return;
    }

    if (lastDefaultsSig.current && lastDefaultsSig.current !== sig) {
      setConfirmModal({
        title: "Пересоздать эпики?",
        message: "Изменился тип проекта или БД. Пересоздать эпики по текущему шаблону? Ваши правки будут перезаписаны.",
        onConfirm: async () => {
          const defaults = await buildDefaultEpics();
          setStateWithNotify((s) => ({ ...s, epics: defaults }));
          lastDefaultsSig.current = sig;
        },
        danger: true,
      });
      return;
    }
    setStep(2);
  };

  return (
    <div className="viewport">
      {onClose && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 20 }}>
          <button className="btn" type="button" onClick={handleCloseClick}>
            Закрыть
          </button>
        </div>
      )}
      <div style={{ width: "100%", maxWidth: 1400, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      {step === 0 && (
        <div className="card animate-in" style={{width:"100%"}}>
          <div className="card-header">
            <h2>Здравствуйте</h2>
            <div className="small">Шаг 1 из 3</div>
          </div>
          <div className="grid">
            <div>
              <label>Название проекта *</label>
              <input
                placeholder="Название проекта"
                value={state.project.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateProject("name", e.target.value)}
              />
            </div>
            <div>
              <label>Дата</label>
              <input
                type="date"
                value={state.project.date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateProject("date", e.target.value)}
              />
            </div>
            <div>
              <label>Язык проекта</label>
              <div style={{display:"flex", gap:8}}>
                <button
                  className={state.project.language === "en" ? "btn primary" : "btn"}
                  type="button"
                  onClick={() => updateProject("language", "en")}
                >
                  English
                </button>
                <button
                  className={state.project.language === "ru" ? "btn primary" : "btn"}
                  type="button"
                  onClick={() => updateProject("language", "ru")}
                >
                  Русский
                </button>
              </div>
            </div>
            <div style={{textAlign:"right", marginTop: 4}}>
              <button className="btn primary" type="button" disabled={!canNext} onClick={() => setStep(1)}>
                Далее
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card animate-in">
          <div className="card-header">
            <h2>Тип проекта и стек</h2>
            <div className="small">Шаг 2 из 3</div>
          </div>
          <div className="grid">
            <div>
              <label>Тип проекта</label>
              <div style={{display:"flex", gap:8}}>
                <button
                  type="button"
                  className={`btn ${state.project.type === "Web" ? "primary" : ""}`}
                  onClick={() => setTypeAndFilterStack("Web")}
                >
                  Web
                </button>
                <button
                  type="button"
                  className={`btn ${state.project.type === "Mobile" ? "primary" : ""}`}
                  onClick={() => setTypeAndFilterStack("Mobile")}
                >
                  Mobile
                </button>
              </div>
            </div>

            <div>
              <label>Стек (мультивыбор)</label>
              <StackMultiSelect
                value={state.project.stack}
                onChange={(v) => {
                  setStateWithNotify((s) => {
                    const prev = s.project.stack;
                    const added = v.find((x) => !prev.includes(x));
                    let next = v;
                    const hasFirebase = v.includes("Firebase");
                    const hasSupabase = v.includes("Supabase");
                    if (added && (added === "Firebase" || added === "Supabase") && hasFirebase && hasSupabase) {
                      next = v.filter((x) => x === added || !isDb(x));
                    }
                    return { ...s, project: { ...s.project, stack: next } } as AppState;
                  });
                  
                  // Отправляем realtime патч
                  if (collab && projectId) {
                    collab.sendPatch({
                      type: "project_meta_update" as const,
                      payload: { stack: v },
                    } as any);
                  }
                  
                  const backend = v.includes("Firebase") ? "Firebase" : v.includes("Supabase") ? "Supabase" : null;
                  if (backend) applyBackendToExistingEpics(backend);
                  const frontend = v.includes("Weweb") ? "Weweb" : v.includes("Webflow") ? "Webflow" : null;
                  if (frontend) applyFrontendToExistingEpics(frontend);
                }}
                presets={currentPresets}
              />
              {(() => {
                const selected = state.project.stack;
                const dbCount = (selected.includes("Firebase") ? 1 : 0) + (selected.includes("Supabase") ? 1 : 0);
                const hasOther = selected.some((x) => !isDb(x));
                const hasWebflow = selected.includes("Webflow");
                const valid = hasWebflow ? hasOther : (dbCount === 1 && hasOther);
                if (valid) return null;
                return (
                  <div className="small" style={{marginTop:6, color:'#ef4444'}}>
                    {hasWebflow
                      ? "Выберите хотя бы один инструмент (Webflow допустим без БД)."
                      : "Требуется выбрать ровно одну БД (Firebase или Supabase) и как минимум один дополнительный инструмент."}
                  </div>
                );
              })()}
            </div>

            <div style={{display:"flex", justifyContent:"space-between", marginTop: 4}}>
              <button className="btn" type="button" onClick={() => setStep(0)}>Назад</button>
              <button
                className="btn primary"
                type="button"
                onClick={proceedToEpics}
                disabled={(() => {
                  const selected = state.project.stack;
                  const dbCount = (selected.includes("Firebase") ? 1 : 0) + (selected.includes("Supabase") ? 1 : 0);
                  const hasOther = selected.some((x) => !isDb(x));
                  const hasWebflow = selected.includes("Webflow");
                  const valid = hasWebflow ? hasOther : (dbCount === 1 && hasOther);
                  return !valid;
                })()}
              >
                Далее
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <>
        {/* Компактная панель информации о проекте */}
        {state.project.name && state.project.stack.length > 0 && (
          <div className="card animate-in" style={{width:"100%", maxWidth:"1280px", marginBottom: 16, padding: 16}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, flexWrap:'wrap'}}>
              <div style={{display:'flex', alignItems:'center', gap:16, flex:1, minWidth:0}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:600, fontSize:16, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                    {state.project.name}
                  </div>
                  <div className="small" style={{color:'#64748b'}}>
                    {state.project.type} • {state.project.language === "en" ? "English" : "Русский"} • {state.project.date}
                  </div>
                </div>
                <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                  {state.project.stack.map((tech) => (
                    <span
                      key={tech}
                      className="small"
                      style={{
                        background: "#f1f5f9",
                        padding: "4px 10px",
                        borderRadius: 6,
                        color: "#475569",
                        border: "1px solid #e2e8f0",
                        whiteSpace:'nowrap'
                      }}
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:12, flexShrink:0}}>
                {collab && (
                  <>
                    {collab.presence.length > 0 && (
                      <div style={{display:'flex', alignItems:'center', gap:8}}>
                        <span className="small" style={{color:'#64748b', whiteSpace:'nowrap'}}>
                          Сейчас в проекте:
                        </span>
                        <UserAvatarGroup users={collab.presence} maxVisible={5} size="small" />
                      </div>
                    )}
                    {!collab.isConnected && collab.presence.length === 0 && (
                      <span className="small" style={{color:'#f59e0b', whiteSpace:'nowrap'}} title="Нет соединения для совместной работы">
                        ⚠️ Offline
                      </span>
                    )}
                  </>
                )}
                <button className="btn" type="button" onClick={() => setStep(0)}>
                  Изменить
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="card animate-in" style={{width:"100%", maxWidth:"1280px"}}>
          <div className="card-header">
            <h2>Эпики и подзадачи</h2>
            <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
              <div className="small">Шаг 3 из 3</div>
              {(() => {
                if (saving) {
                  return <span className="small" style={{color:'#0f172a', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 6px'}}>⏳ Сохранение...</span>;
                }
                if (dirtyRef.current) {
                  return <span className="small" style={{color:'#b45309', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 6px'}}>● Есть изменения</span>;
                }
                return <span className="small" style={{color:'#16a34a', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 6px'}}>✓ Сохранено</span>;
              })()}
              {(() => {
                const sums = state.epics.reduce((acc, e) => {
                  e.tasks.forEach((t) => {
                    const v = typeof t.estimate === 'number' && !Number.isNaN(t.estimate) ? t.estimate : 0;
                    if (!v) return;
                    if (t.type === 'BA') acc.BA += v;
                    else if (t.type === 'NC') acc.NC += v;
                    else if (t.type === 'DE') acc.DE += v;
                    acc.ALL += v;
                  });
                  return acc;
                }, {BA:0, NC:0, DE:0, ALL:0});
                const chip = (label:string, val:number) => (
                  <span className="small" style={{color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 6px'}}>{label}: {val} ч</span>
                );
                return (
                  <div style={{display:'flex', gap:6, alignItems:'center'}}>
                    {chip('BA', sums.BA)}
                    {chip('NC', sums.NC)}
                    {chip('DE', sums.DE)}
                    {chip('Всего', sums.ALL)}
                  </div>
                );
              })()}
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setConfirmModal({
                    title: "Пересоздать эпики?",
                    message: "Пересоздать эпики по текущему шаблону? Ваши правки будут перезаписаны.",
                    onConfirm: async () => {
                      const defaults = await buildDefaultEpics();
                      setStateWithNotify((s) => ({ ...s, epics: defaults }));
                      const isMobile = state.project.type === "Mobile";
                      const backend = state.project.stack.includes("Firebase") ? "Firebase" : "Supabase";
                      lastDefaultsSig.current = `${isMobile ? 'mobile' : 'web'}|${backend}`;
                    },
                    danger: true,
                  });
                }}
              >
                Перегенерировать по шаблону
              </button>
            </div>
          </div>
          {errors && Object.keys(errors).length > 0 && (
            <div className="small" style={{color:'#ef4444', marginBottom:8}}>
              Обнаружены ошибки в эпиках: {Object.keys(errors).length}. Проверьте подсветку слева и поля задач.
            </div>
          )}
          <EpicEditor 
            value={state.epics} 
            onChange={updateEpics} 
            errors={errors ?? undefined}
            editingByEpicId={collab?.editingByEpicId}
            editingByTaskId={collab?.editingByTaskId}
          />
          <div style={{display:"flex", justifyContent:"space-between", marginTop: 8, gap: 8, flexWrap:"wrap"}}>
            <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
              <button className="btn" type="button" onClick={() => setStep(1)}>Назад</button>
              {projectId && isOwner && (
                <>
                  <button className="btn" type="button" onClick={handleShare}>
                    Скопировать ссылку
                  </button>
                  <button className="btn" type="button" onClick={handleInviteClick} disabled={inviting}>
                    Пригласить
                  </button>
                  <button className="btn" type="button" onClick={() => setShowMembers(!showMembers)}>
                    {showMembers ? "Скрыть участников" : "Показать участников"}
                  </button>
                  <button className="btn danger" type="button" onClick={handleDeleteProject}>
                    Удалить проект
                  </button>
                </>
              )}
            </div>
            <div style={{display:"flex", gap:8}}>
              {onSave && (
                <button className="btn" type="button" onClick={handleSave} disabled={saving}>
                  {saving ? "Сохранение..." : "Сохранить проект"}
                </button>
              )}
              <button className="btn primary" type="button" onClick={onGenerate} disabled={downloading}>
                {downloading ? "Генерация..." : "Скачать XLSX"}
              </button>
            </div>
          </div>

          {/* Список участников */}
          {showMembers && projectId && currentUserId && (
            <ProjectMembers
              projectId={projectId}
              currentUserId={currentUserId}
              isOwner={isOwner}
            />
          )}
        </div>
        </>
      )}

      {step === 3 && (
        <div className="card animate-in" style={{width:"100%"}}>
          <div className="card-header">
            <h2>JSON</h2>
          </div>
          <YAMLPreview value={yaml} />
          <div style={{marginTop:8}}>
            <button className="btn" type="button" onClick={() => setStep(2)}>Назад к эпикам</button>
          </div>
        </div>
      )}

      </div>

      <InviteModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onInvite={handleInviteSubmit}
      />

      {alertModal && (
        <AlertModal
          isOpen={true}
          onClose={() => setAlertModal(null)}
          title={alertModal.title}
          message={alertModal.message}
          type={alertModal.type}
        />
      )}

      {confirmModal && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setConfirmModal(null)}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          danger={confirmModal.danger}
        />
      )}
    </div>
  );
}
