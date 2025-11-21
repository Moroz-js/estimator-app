"use client";
import EpicEditor from "@/components/EpicEditor";
import StackMultiSelect from "@/components/StackMultiSelect";
import YAMLPreview from "@/components/YAMLPreview";
import { AppState, Epic, SubtaskType } from "@/lib/types";
import { generateYaml } from "@/lib/yaml";
import jsyaml from "js-yaml";
import { ChangeEvent, useEffect, useRef, useState } from "react";

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
};

export default function EstimatorApp({ initialState, onSave, onClose, projectId }: EstimatorAppProps) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [yaml, setYaml] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [state, setState] = useState<AppState>(
    initialState ?? {
      project: {
        name: "",
        date: today(),
        type: "Web",
        stack: [],
      },
      epics: [],
    }
  );
  const lastDefaultsSig = useRef<string | null>(null);
  const [errors, setErrors] = useState<ValidationMap | null>(null);

  const initialRef = useRef<AppState | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (initialState) {
      setState(initialState);
      initialRef.current = initialState;
      dirtyRef.current = false;
    }
  }, [initialState]);

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

  useEffect(() => {
    if (!projectId) return;
    const checkPublicStatus = async () => {
      try {
        const { supabase } = await import("@/lib/supabaseClient");
        const { data } = await supabase
          .from("projects")
          .select("is_public")
          .eq("id", projectId)
          .single();
        if (data) {
          setIsPublic(data.is_public ?? false);
        }
      } catch (e) {
        console.error("Failed to check public status:", e);
      }
    };
    checkPublicStatus();
  }, [projectId]);

  const canNext = state.project.name.trim().length > 0;

  const updateProject = <K extends keyof AppState["project"]>(key: K, val: AppState["project"][K]) => {
    setState((s: AppState) => ({ ...s, project: { ...s.project, [key]: val } }));
  };

  const applyFrontendToExistingEpics = (frontend: "Weweb" | "Webflow") => {
    setState((s) => {
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
    setState((s) => {
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

  const updateEpics = (epics: Epic[]) => setState((s: AppState) => ({ ...s, epics }));

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
      alert(`Не удалось получить XLSX: ${e?.message || e}`);
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
      alert(e?.message || "Не удалось сохранить проект");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseClick = () => {
    if (!onClose) return;
    if (dirtyRef.current) {
      const ok = window.confirm("Есть несохранённые изменения. Точно закрыть?");
      if (!ok) return;
    }
    onClose();
  };

  const handleShare = async () => {
    if (!projectId) {
      alert("Сначала сохраните проект");
      return;
    }
    
    const fullUrl = `${window.location.origin}/project/${projectId}/preview`;
    
    if (isPublic) {
      await navigator.clipboard.writeText(fullUrl);
      alert("Ссылка скопирована в буфер обмена!");
      return;
    }
    
    setSharing(true);
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error("Сессия истекла, перезайдите");
      }

      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, accessToken: session.access_token }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Не удалось создать ссылку");
      }
      setIsPublic(true);
      await navigator.clipboard.writeText(fullUrl);
      alert("Ссылка скопирована в буфер обмена!");
    } catch (e: any) {
      alert(e?.message || "Не удалось создать ссылку");
    } finally {
      setSharing(false);
    }
  };

  const handleUnshare = async () => {
    if (!projectId) return;
    
    const ok = window.confirm("Отключить публичный доступ к проекту?");
    if (!ok) return;
    
    setSharing(true);
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error("Сессия истекла, перезайдите");
      }

      const res = await fetch("/api/unshare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, accessToken: session.access_token }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Не удалось отключить доступ");
      }
      setIsPublic(false);
      alert("Публичный доступ отключён");
    } catch (e: any) {
      alert(e?.message || "Не удалось отключить доступ");
    } finally {
      setSharing(false);
    }
  };

  const currentPresets = presetsByType(state.project.type);
  const setTypeAndFilterStack = (type: "Web" | "Mobile") => {
    setState((s) => {
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
      setState((s) => ({ ...s, epics: defaults }));
      lastDefaultsSig.current = sig;
      setStep(2);
      return;
    }

    if (lastDefaultsSig.current && lastDefaultsSig.current !== sig) {
      const ok = window.confirm("Изменился тип проекта или БД. Пересоздать эпики по текущему шаблону? Ваши правки будут перезаписаны.");
      if (ok) {
        const defaults = await buildDefaultEpics();
        setState((s) => ({ ...s, epics: defaults }));
        lastDefaultsSig.current = sig;
      }
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
                  setState((s) => {
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
        <div className="card animate-in" style={{width:"100%", maxWidth:"1280px"}}>
          <div className="card-header">
            <h2>Эпики и подзадачи</h2>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
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
              {isPublic && projectId && (
                <button 
                  className="small" 
                  style={{color:'#3b82f6', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 6px', background:'transparent', cursor:'pointer'}}
                  onClick={handleUnshare}
                  title="Нажмите, чтобы отключить публичный доступ"
                >
                  🔗 Публичный
                </button>
              )}
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
                onClick={async () => {
                  const ok = window.confirm("Пересоздать эпики по текущему шаблону? Ваши правки будут перезаписаны.");
                  if (!ok) return;
                  const defaults = await buildDefaultEpics();
                  setState((s) => ({ ...s, epics: defaults }));
                  const isMobile = state.project.type === "Mobile";
                  const backend = state.project.stack.includes("Firebase") ? "Firebase" : "Supabase";
                  lastDefaultsSig.current = `${isMobile ? 'mobile' : 'web'}|${backend}`;
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
          <EpicEditor value={state.epics} onChange={updateEpics} errors={errors ?? undefined} />
          <div style={{display:"flex", justifyContent:"space-between", marginTop: 8, gap: 8}}>
            <button className="btn" type="button" onClick={() => setStep(1)}>Назад</button>
            <div style={{display:"flex", gap:8}}>
              {projectId && (
                <button className="btn" type="button" onClick={handleShare} disabled={sharing}>
                  {sharing ? "Создание ссылки..." : isPublic ? "Скопировать ссылку" : "Поделиться"}
                </button>
              )}
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
  );
}
