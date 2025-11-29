"use client";
import EpicEditor from "@/components/EpicEditor";
import StackMultiSelect from "@/components/StackMultiSelect";
import YAMLPreview from "@/components/YAMLPreview";
import InviteModal from "@/components/InviteModal";
import ImportEpicsModal from "@/components/ImportEpicsModal";
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
  const [importEpicsModalOpen, setImportEpicsModalOpen] = useState(false);
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
  
  // Автосохранение
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Функция сохранения (используется и вручную, и автоматически)
  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(state);
      // Сбрасываем индикатор несохранённых изменений на текущий снимок
      initialRef.current = state;
      dirtyRef.current = false;
    } catch (e: any) {
      setAlertModal({
        title: "Error",
        message: e?.message || "Failed to save project",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [onSave, state]);

  // Автосохранение через 5 секунд после последнего изменения
  useEffect(() => {
    // Очищаем предыдущий таймер
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Не запускаем автосохранение если:
    // - нет функции сохранения
    // - нет несохраненных изменений
    // - уже идет сохранение
    if (!onSave || !dirtyRef.current || saving) {
      return;
    }

    // Запускаем таймер на 5 секунд
    autoSaveTimeoutRef.current = setTimeout(() => {
      handleSave();
    }, 5000);

    // Очистка при размонтировании
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [state, onSave, saving, handleSave]);

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
        title: "Error",
        message: `Failed to get XLSX: ${e?.message || e}`,
        type: "error",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleCloseClick = () => {
    if (!onClose) return;
    if (dirtyRef.current) {
      setConfirmModal({
        title: "Unsaved changes",
        message: "There are unsaved changes. Are you sure you want to close?",
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
        title: "Project not saved",
        message: "Save the project first",
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
        throw new Error("Session expired, please log in again");
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
        throw new Error(data.error || "Failed to invite user");
      }
      
      setAlertModal({
        title: "Success",
        message: "User invited successfully!",
        type: "success",
      });
    } catch (e: any) {
      setAlertModal({
        title: "Error",
        message: e?.message || "Failed to invite user",
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
        title: "Project not saved",
        message: "Save the project first",
        type: "info",
      });
      return;
    }
    
    const fullUrl = `${window.location.origin}/project/${projectId}/preview`;
    await navigator.clipboard.writeText(fullUrl);
    setAlertModal({
      title: "Success",
      message: "Link copied to clipboard!",
      type: "success",
    });
  };

  const handleDeleteProject = () => {
    if (!projectId) return;

    setConfirmModal({
      title: "Delete project?",
      message: "Are you sure you want to delete this project? This action cannot be undone.",
      onConfirm: async () => {
        try {
          const { supabase } = await import("@/lib/supabaseClient");
          const { data: { session } } = await supabase.auth.getSession();
          
          if (!session?.access_token) {
            throw new Error("Session expired, please log in again");
          }

          const res = await fetch("/api/delete-project", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, accessToken: session.access_token }),
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to delete project");
          }

          setAlertModal({
            title: "Success",
            message: "Project deleted",
            type: "success",
          });

          // Закрываем через секунду
          setTimeout(() => {
            if (onClose) onClose();
          }, 1000);
        } catch (e: any) {
          setAlertModal({
            title: "Error",
            message: e?.message || "Failed to delete project",
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

  const proceedToEpics = () => {
    setStep(2);
  };

  return (
    <div className="viewport">
      {onClose && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 20 }}>
          <button className="btn" type="button" onClick={handleCloseClick}>
            Exit
          </button>
        </div>
      )}
      <div style={{ width: "100%", maxWidth: 1400, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      {step === 0 && (
        <div className="card animate-in" style={{width:"100%"}}>
          <div className="card-header">
            <h2>Hello</h2>
            <div className="small">Step 1 of 3</div>
          </div>
          <div className="grid">
            <div>
              <label>Project name *</label>
              <input
                placeholder="Project name"
                value={state.project.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateProject("name", e.target.value)}
              />
            </div>
            <div>
              <label>Date</label>
              <input
                type="date"
                value={state.project.date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateProject("date", e.target.value)}
              />
            </div>
            <div>
              <label>Project language</label>
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
            <h2>Project type and stack</h2>
            <div className="small">Step 2 of 3</div>
          </div>
          <div className="grid">
            <div>
              <label>Project type</label>
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
                      ? "Select at least one tool (Webflow is allowed without a database)."
                      : "You must select exactly one database (Firebase or Supabase) and at least one additional tool."}
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
                    {state.project.type} • {state.project.language === "en" ? "English" : "Russian"} • {state.project.date}
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
                          Online:
                        </span>
                        <UserAvatarGroup users={collab.presence} maxVisible={5} size="small" />
                      </div>
                    )}
                    {!collab.isConnected && collab.presence.length === 0 && (
                      <span className="small" style={{color:'#f59e0b', whiteSpace:'nowrap'}} title="No connection for collaboration">
                        ⚠️ Offline
                      </span>
                    )}
                  </>
                )}
                <button className="btn" type="button" onClick={() => setStep(0)}>
                  Settings
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="card animate-in" style={{width:"100%", maxWidth:"1280px"}}>
          <div className="card-header">
            <h2>Epics and subtasks</h2>
            <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
              <div className="small">Step 3 of 3</div>
              {(() => {
                if (saving) {
                  return <span className="small" style={{color:'#0f172a', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 6px'}}>⏳ Saving...</span>;
                }
                if (dirtyRef.current) {
                  return <span className="small" style={{color:'#b45309', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 6px'}}>● Unsaved changes</span>;
                }
                return <span className="small" style={{color:'#16a34a', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 6px'}}>✓ Saved</span>;
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
                  <span className="small" style={{color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 6px'}}>{label}: {val} h</span>
                );
                return (
                  <div style={{display:'flex', gap:6, alignItems:'center'}}>
                    {chip('BA', sums.BA)}
                    {chip('NC', sums.NC)}
                    {chip('DE', sums.DE)}
                    {chip('Total', sums.ALL)}
                  </div>
                );
              })()}
            </div>
          </div>
          {errors && Object.keys(errors).length > 0 && (
            <div className="small" style={{color:'#ef4444', marginBottom:8}}>
              Errors found in epics: {Object.keys(errors).length}. Check the backlight on the left and the task fields.
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
              <button className="btn" type="button" onClick={() => setStep(1)}>Back</button>
              {isOwner && (
                <button className="btn" type="button" onClick={() => setImportEpicsModalOpen(true)}>
                  Import epics
                </button>
              )}
              {projectId && isOwner && (
                <>
                  <button className="btn" type="button" onClick={handleShare}>
                    Copy link                  </button>
                  <button className="btn" type="button" onClick={handleInviteClick} disabled={inviting}>
                    Invite member
                  </button>
                  <button className="btn" type="button" onClick={() => setShowMembers(!showMembers)}>
                    {showMembers ? "Hide members" : "Show members"}
                  </button>
                  <button className="btn danger" type="button" onClick={handleDeleteProject}>
                    Delete project
                  </button>
                </>
              )}
            </div>
            <div style={{display:"flex", gap:8}}>
              {onSave && (
                <button className="btn" type="button" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save project"}
                </button>
              )}
              <button className="btn primary" type="button" onClick={onGenerate} disabled={downloading}>
                {downloading ? "Generating..." : "Download XLSX"}
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
            <button className="btn" type="button" onClick={() => setStep(2)}>Back to the epics</button>
          </div>
        </div>
      )}

      </div>

      <InviteModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onInvite={handleInviteSubmit}
      />

      <ImportEpicsModal
        isOpen={importEpicsModalOpen}
        onClose={() => setImportEpicsModalOpen(false)}
        onImport={(epics) => {
          setStateWithNotify((prev) => ({
            ...prev,
            epics: [...prev.epics, ...epics],
          }));
          dirtyRef.current = true;
        }}
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
