"use client";
import { Epic, Subtask, SubtaskType, PresencePayload } from "@/lib/types";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import jsyaml from "js-yaml";
import { UserAvatarGroup } from "./UserAvatar";
import { useProjectCollab } from "./ProjectCollabProvider";

type TaskField = "type" | "title" | "estimate";
type ValidationMap = Record<string, { epicTitle?: boolean; noTasks?: boolean; tasks?: Record<string, Partial<Record<TaskField, boolean>>> }>;

export interface EpicEditorProps {
  value: Epic[];
  onChange: (next: Epic[]) => void;
  errors?: ValidationMap;
  editingByEpicId?: Record<string, PresencePayload[]>;
  editingByTaskId?: Record<string, PresencePayload[]>;
  projectType?: "Web" | "Mobile";
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function EpicEditor({ value, onChange, errors, editingByEpicId, editingByTaskId, projectType: propProjectType = "Web" }: EpicEditorProps) {
  const [query, setQuery] = useState("");
  const [selectedEpicId, setSelectedEpicId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [presets, setPresets] = useState<Array<{ title: string; tasks: { type: string; title: string; estimate?: number }[] }>>([]);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [projectType, setProjectType] = useState<"Web" | "Mobile">("Web");

  // Realtime collaboration
  let collab: ReturnType<typeof useProjectCollab> | null = null;
  try {
    collab = useProjectCollab();
  } catch {
    // Если не в контексте, collab будет null
  }

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Обработчики фокуса для presence
  const handleFocus = useCallback((epicId: string, taskId?: string) => {
    if (!collab) return;
    
    // Очищаем предыдущий таймер
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    collab.updatePresence({
      currentEpicId: epicId,
      currentTaskId: taskId,
      isTyping: true,
    });
  }, [collab]);

  const handleBlur = useCallback(() => {
    if (!collab) return;

    // Debounce для isTyping
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      collab.updatePresence({
        currentEpicId: undefined,
        currentTaskId: undefined,
        isTyping: false,
      });
    }, 2000);
  }, [collab]);

  const handleInput = useCallback(() => {
    if (!collab) return;

    // При вводе сбрасываем таймер
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Устанавливаем новый таймер
    typingTimeoutRef.current = setTimeout(() => {
      collab.updatePresence({
        isTyping: false,
      });
    }, 2000);
  }, [collab]);

  const loadPresets = async (type: "Web" | "Mobile") => {
    if (presets.length) return;
    try {
      const res = await fetch("/presets.yaml", { cache: "no-store" });
      const text = await res.text();
      const parsed = jsyaml.load(text) as any;
      const typeKey = type.toLowerCase();
      const list = Array.isArray(parsed?.[typeKey]) ? parsed[typeKey] : [];
      setPresets(list);
      setProjectType(type);
    } catch {}
  };

  // Close on ESC
  useEffect(() => {
    if (!presetsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresetsOpen(false);
    };
    window.addEventListener('keydown', onKey as any);
    return () => window.removeEventListener('keydown', onKey as any);
  }, [presetsOpen]);

  const addEpic = () => {
    const nextEpic: Epic = { id: uid("epic"), title: "", tasks: [] };
    const authIdx = value.findIndex((e) => e.title === "Auth");
    const integrationsIdx = value.findIndex((e) => e.title === "Integrations");
    const publishingIdx = value.findIndex((e) => e.title === "AppStore & GooglePlay publishing");
    let insertAt = authIdx >= 0 ? authIdx + 1 : value.length;
    if (integrationsIdx >= 0 && insertAt > integrationsIdx) insertAt = integrationsIdx;
    if (publishingIdx >= 0 && insertAt > publishingIdx) insertAt = publishingIdx;
    const next = [...value];
    next.splice(insertAt, 0, nextEpic);
    onChange(next);
    
    // Отправляем патч
    if (collab) {
      collab.sendPatch({
        type: "epic_create" as const,
        epic: nextEpic,
      } as any);
    }
  };

  const addEpicFromPreset = (presetIndex: number) => {
    const p = presets[presetIndex];
    if (!p) return;
    const epic: Epic = {
      id: uid("epic"),
      title: p.title,
      tasks: (p.tasks || []).map((t) => ({
        id: uid("t"),
        type: (t.type as SubtaskType) ?? "",
        title: t.title,
        estimate: typeof t.estimate === "number" ? t.estimate : undefined,
        comment: "",
      })),
    };
    const authIdx = value.findIndex((e) => e.title === "Auth");
    const integrationsIdx = value.findIndex((e) => e.title === "Integrations");
    const publishingIdx = value.findIndex((e) => e.title === "AppStore & GooglePlay publishing");
    let insertAt = authIdx >= 0 ? authIdx + 1 : value.length;
    if (integrationsIdx >= 0 && insertAt > integrationsIdx) insertAt = integrationsIdx;
    if (publishingIdx >= 0 && insertAt > publishingIdx) insertAt = publishingIdx;
    const next = [...value];
    next.splice(insertAt, 0, epic);
    onChange(next);
    setSelectedEpicId(epic.id);
    setPresetsOpen(false);
    
    // Отправляем патч
    if (collab) {
      collab.sendPatch({
        type: "epic_create" as const,
        epic,
      } as any);
    }
  };



  const removeEpic = (id: string) => {
    onChange(value.filter((e) => e.id !== id));
    if (collab) {
      collab.sendPatch({
        type: "epic_delete" as const,
        epicId: id,
      } as any);
    }
  };

  const updateEpic = (id: string, patch: Partial<Epic>) => {
    onChange(value.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    if (collab) {
      collab.sendPatch({
        type: "epic_update" as const,
        epicId: id,
        payload: patch,
      } as any);
    }
  };

  const addTask = (epicId: string) => {
    const task: Subtask = { id: uid("t"), type: "", title: "", estimate: undefined, comment: "" };
    onChange(
      value.map((e) => (e.id === epicId ? { ...e, tasks: [...e.tasks, task] } : e))
    );
    if (collab) {
      collab.sendPatch({
        type: "task_create" as const,
        epicId,
        task,
      } as any);
    }
  };

  const updateTask = (epicId: string, taskId: string, patch: Partial<Subtask>) => {
    onChange(
      value.map((e) =>
        e.id === epicId
          ? { ...e, tasks: e.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) }
          : e
      )
    );
    if (collab) {
      collab.sendPatch({
        type: "task_update" as const,
        epicId,
        taskId,
        payload: patch,
      } as any);
    }
  };

  const removeTask = (epicId: string, taskId: string) => {
    onChange(
      value.map((e) => (e.id === epicId ? { ...e, tasks: e.tasks.filter((t) => t.id !== taskId) } : e))
    );
    if (collab) {
      collab.sendPatch({
        type: "task_delete" as const,
        epicId,
        taskId,
      } as any);
    }
  };

  // Move helpers
  const [bumpEpic, setBumpEpic] = useState<{ id: string; dir: -1 | 1 } | null>(null);
  const moveEpic = (id: string, dir: -1 | 1) => {
    setBumpEpic({ id, dir });
    setTimeout(() => setBumpEpic((b) => (b && b.id === id ? null : b)), 180);
    const list = [...value];
    const idx = list.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const to = idx + dir;
    if (to < 0 || to >= list.length) return;
    const [moved] = list.splice(idx, 1);
    list.splice(to, 0, moved);
    onChange(list);
  };

  const [bumpTask, setBumpTask] = useState<{ epicId: string; taskId: string; dir: -1 | 1 } | null>(null);
  const moveTask = (epicId: string, taskId: string, dir: -1 | 1) => {
    setBumpTask({ epicId, taskId, dir });
    setTimeout(() => setBumpTask((b) => (b && b.epicId === epicId && b.taskId === taskId ? null : b)), 180);
    onChange(
      value.map((e) => {
        if (e.id !== epicId) return e;
        const tasks = [...e.tasks];
        const idx = tasks.findIndex((t) => t.id === taskId);
        if (idx < 0) return e;
        const to = idx + dir;
        if (to < 0 || to >= tasks.length) return e;
        const [moved] = tasks.splice(idx, 1);
        tasks.splice(to, 0, moved);
        return { ...e, tasks };
      })
    );
  };

  // Drag & Drop state
  const draggingEpicId = useRef<string | null>(null);
  const [dragOverEpicId, setDragOverEpicId] = useState<string | null>(null);
  const draggingTask = useRef<{ epicId: string; taskId: string } | null>(null);
  const [dragOverTask, setDragOverTask] = useState<{ epicId: string; taskId: string } | null>(null);

  const onEpicDragStart = (id: string) => (e: React.DragEvent) => {
    draggingEpicId.current = id;
    e.dataTransfer.effectAllowed = "move";
  };
  const onEpicDragOver = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverEpicId(id);
  };
  const onEpicDrop = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const fromId = draggingEpicId.current;
    draggingEpicId.current = null;
    setDragOverEpicId(null);
    if (!fromId || fromId === id) return;
    const list = [...value];
    const from = list.findIndex((x) => x.id === fromId);
    const to = list.findIndex((x) => x.id === id);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    onChange(list);
    
    // Отправляем reorder патч
    if (collab) {
      collab.sendPatch({
        type: "epic_reorder" as const,
        epicOrder: list.map((e) => e.id),
      } as any);
    }
  };

  const onTaskDragStart = (epicId: string, taskId: string) => (e: React.DragEvent) => {
    draggingTask.current = { epicId, taskId };
    e.dataTransfer.effectAllowed = "move";
  };
  const onTaskDragOver = (epicId: string, taskId: string) => (e: React.DragEvent) => {
    if (!draggingTask.current || draggingTask.current.epicId !== epicId) return;
    e.preventDefault();
    setDragOverTask({ epicId, taskId });
  };
  const onTaskDrop = (epicId: string, taskId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const drag = draggingTask.current;
    draggingTask.current = null;
    setDragOverTask(null);
    if (!drag || drag.epicId !== epicId) return; // only within same epic
    
    let reorderedTasks: string[] = [];
    onChange(
      value.map((ep) => {
        if (ep.id !== epicId) return ep;
        const list = [...ep.tasks];
        const from = list.findIndex((t) => t.id === drag.taskId);
        const to = list.findIndex((t) => t.id === taskId);
        if (from < 0 || to < 0) return ep;
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved);
        reorderedTasks = list.map((t) => t.id);
        return { ...ep, tasks: list };
      })
    );
    
    // Отправляем reorder патч
    if (collab && reorderedTasks.length > 0) {
      collab.sendPatch({
        type: "task_reorder" as const,
        epicId,
        taskOrder: reorderedTasks,
      } as any);
    }
  };

  // ensure selection exists
  useEffect(() => {
    if (!selectedEpicId || !value.find((e) => e.id === selectedEpicId)) {
      setSelectedEpicId(value[0]?.id ?? null);
    }
  }, [value, selectedEpicId]);

  const filteredEpics = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return value;
    return value.filter((e) => (e.title || "").toLowerCase().includes(q));
  }, [value, query]);

  const activeEpic = useMemo(() => value.find((e) => e.id === selectedEpicId) || null, [value, selectedEpicId]);

  return (
    <div className="epics-layout">
      <div className="ep-topbar">
        <input
          placeholder="Search in epic"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{maxWidth: 320}}
        />
      </div>

      <div className="ep-cols">
        <aside className="ep-list">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 4px 8px 4px'}}>
            <div className="small" style={{color:'#475569'}}>Epics</div>
            <div style={{display:'flex', gap:6}}>
              <button className="btn" type="button" onClick={addEpic}>+ Epic</button>
              <button
                className="btn"
                type="button"
                onClick={async () => { setPresetsOpen((v) => !v); await loadPresets(propProjectType); }}
              >
                Templates
              </button>
            </div>
          </div>

          {presetsOpen && createPortal(
            (
              <div style={{position:'fixed', inset:0, zIndex:60}}>
                <div onClick={() => setPresetsOpen(false)} style={{position:'absolute', inset:0, background:'rgba(15,23,42,.45)'}} />
                <div style={{position:'relative', zIndex:61, maxWidth:720, width:'90%', margin:'10vh auto', background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:12, boxShadow:'0 20px 60px rgba(2,6,23,.25)'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div style={{fontWeight:700}}>Choose from templates ({projectType})</div>
                    <button className="icon-btn" title="Close" onClick={() => setPresetsOpen(false)}>✕</button>
                  </div>
                  <div className="divider" />
                  <div style={{display:'grid', gap:8}}>
                    {presets.map((p, idx) => (
                      <div key={idx} className="section" style={{padding:8, display:'grid', gridTemplateColumns:'1fr auto auto', alignItems:'center', gap:8}}>
                        <div style={{fontWeight:600}}>{p.title}</div>
                        <button className="btn" type="button" onClick={() => setPreviewIdx(previewIdx === idx ? null : idx)}>Info</button>
                        <button className="btn primary" type="button" onClick={() => addEpicFromPreset(idx)}>Add</button>
                        {previewIdx === idx && (() => {
                          const sums = (p.tasks || []).reduce((acc, t) => {
                            const v = typeof t.estimate === 'number' && !Number.isNaN(t.estimate) ? t.estimate : 0;
                            if (!v) return acc; if (t.type === 'BA') acc.BA += v; else if (t.type === 'NC') acc.NC += v; else if (t.type === 'DE') acc.DE += v; acc.ALL += v; return acc;
                          }, {BA:0, NC:0, DE:0, ALL:0});
                          return (
                            <div style={{gridColumn:'1 / -1'}}>
                              <div style={{display:'flex', gap:6, marginTop:6}}>
                                <span className="small" style={{color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 6px'}}>BA: {sums.BA} h</span>
                                <span className="small" style={{color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 6px'}}>NC: {sums.NC} h</span>
                                <span className="small" style={{color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 6px'}}>DE: {sums.DE} h</span>
                                <span className="small" style={{color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 6px'}}>Total: {sums.ALL} h</span>
                              </div>
                              <div style={{marginTop:8}}>
                                <table className="table">
                                  <thead>
                                    <tr>
                                      <th style={{width:80}}>Type</th>
                                      <th>Task title</th>
                                      <th style={{width:120}}>Estimate</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(p.tasks || []).map((t, i) => (
                                      <tr key={i}>
                                        <td>{t.type}</td>
                                        <td>{t.title}</td>
                                        <td>{typeof t.estimate === 'number' ? t.estimate : ''}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                    {presets.length === 0 && (
                      <div className="small">No templates</div>
                    )}
                  </div>
                </div>
              </div>
            ), document.body)}

          {filteredEpics.map((epic) => (
            <div
              key={epic.id}
              className={`ep-row ${selectedEpicId === epic.id ? 'active' : ''} ${(errors && errors[epic.id]) ? 'invalid' : ''} ${bumpEpic && bumpEpic.id === epic.id ? (bumpEpic.dir === -1 ? 'bump-up' : 'bump-down') : ''}`}
              onClick={() => setSelectedEpicId(epic.id)}
              onDragOver={onEpicDragOver(epic.id)}
              onDrop={onEpicDrop(epic.id)}
              style={dragOverEpicId === epic.id ? { outline: '2px dashed #111' } : undefined}
            >
              <span
                className="drag-handle"
                title="Drag epic"
                draggable
                onDragStart={onEpicDragStart(epic.id)}
              >
                ≡
              </span>
              <div className="ep-title">{epic.title || 'Untitled'}</div>
              <span className="ep-badge">{epic.tasks.length}</span>
              {editingByEpicId && editingByEpicId[epic.id] && editingByEpicId[epic.id].length > 0 && (
                <div style={{marginLeft: 'auto', marginRight: 8}}>
                  <UserAvatarGroup users={editingByEpicId[epic.id]} maxVisible={2} size="small" />
                </div>
              )}
              <div className="ep-actions">
                <button className="btn danger" title="Delete" type="button" onClick={(e) => { e.stopPropagation(); removeEpic(epic.id); }}>✕</button>
              </div>
            </div>
          ))}
          {filteredEpics.length === 0 && (
            <div className="small" style={{padding:8}}>Nothing found</div>
          )}
        </aside>

        <main className="ep-editor">
          {!activeEpic && (
            <div className="small">No epic selected. Create or select an epic on the left.</div>
          )}
          {activeEpic && (
            <div>
              <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'flex-end'}}>
                <div>
                  <label>Epic title</label>
                  <input
                    value={activeEpic.title}
                    onChange={(e) => updateEpic(activeEpic.id, { title: e.target.value })}
                    onFocus={() => handleFocus(activeEpic.id)}
                    onBlur={handleBlur}
                    onInput={handleInput}
                    className={(errors && errors[activeEpic.id]?.epicTitle) ? 'invalid-input' : undefined}
                    placeholder="Epic title"
                  />
                </div>
                <div>
                  <button className="btn" type="button" onClick={() => addTask(activeEpic.id)}>Add a subtask</button>
                </div>
              </div>

              <table className="table" style={{marginTop:8}}>
                <thead>
                  <tr>
                    <th style={{width:86}}></th>
                    <th style={{width:90}}>Type</th>
                    <th>Task title</th>
                    <th style={{width:120}}>Total (h)</th>
                    <th style={{width:110}}></th>
                  </tr>
                </thead>
                <tbody>
                  {activeEpic.tasks.map((t) => {
                    const tErr = errors && errors[activeEpic.id]?.tasks && errors[activeEpic.id]?.tasks![t.id] || {};
                    return (
                    <>
                    <tr
                      key={t.id}
                      onDragOver={onTaskDragOver(activeEpic.id, t.id)}
                      onDrop={onTaskDrop(activeEpic.id, t.id)}
                      className={bumpTask && bumpTask.epicId === activeEpic.id && bumpTask.taskId === t.id ? (bumpTask.dir === -1 ? 'bump-up' : 'bump-down') : ''}
                      style={dragOverTask && dragOverTask.epicId === activeEpic.id && dragOverTask.taskId === t.id ? { outline: '2px dashed #111' } : undefined}
                    >
                      <td>
                        <div style={{display:'flex', alignItems:'center', gap:6}}>
                          <span
                            className="drag-handle"
                            title="Drag task"
                            draggable
                            onDragStart={onTaskDragStart(activeEpic.id, t.id)}
                          >
                            ≡
                          </span>
                        </div>
                      </td>
                      <td>
                        <select
                          value={t.type}
                          onChange={(e) => updateTask(activeEpic.id, t.id, { type: e.target.value as SubtaskType })}
                          onFocus={() => handleFocus(activeEpic.id, t.id)}
                          onBlur={handleBlur}
                          style={{ width: 80 }}
                          className={tErr.type ? 'invalid-input' : undefined}
                        >
                          <option value="">—</option>
                          <option value="BA">BA</option>
                          <option value="NC">NC</option>
                          <option value="DE">DE</option>
                        </select>
                      </td>
                      <td>
                        <input
                          value={t.title}
                          onChange={(e) => updateTask(activeEpic.id, t.id, { title: e.target.value })}
                          onFocus={() => handleFocus(activeEpic.id, t.id)}
                          onBlur={handleBlur}
                          onInput={handleInput}
                          className={tErr.title ? 'invalid-input' : undefined}
                          placeholder="Task title"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={t.estimate ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateTask(activeEpic.id, t.id, { estimate: v === '' ? undefined : Math.max(0, Number(v)) });
                          }}
                          onFocus={() => handleFocus(activeEpic.id, t.id)}
                          onBlur={handleBlur}
                          onInput={handleInput}
                          className={tErr.estimate ? 'invalid-input' : undefined}
                        />
                      </td>
                      <td>
                        <div style={{display:'flex', gap:6, justifyContent:'flex-end', alignItems:'center'}}>
                          {editingByTaskId && editingByTaskId[t.id] && editingByTaskId[t.id].length > 0 && (
                            <UserAvatarGroup users={editingByTaskId[t.id]} maxVisible={2} size="small" />
                          )}
                          <button
                            type="button"
                            className="icon-btn"
                            title={expanded[t.id] ? 'Hide comment' : 'Show comment'}
                            onClick={() => setExpanded((s) => ({...s, [t.id]: !s[t.id]}))}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                          </button>
                          <button
                            type="button"
                            className="icon-btn danger"
                            title="Delete"
                            onClick={() => removeTask(activeEpic.id, t.id)}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded[t.id] && (
                      <tr>
                        <td colSpan={5}>
                          <label>Comment</label>
                          <textarea
                            value={t.comment ?? ''}
                            onChange={(e) => updateTask(activeEpic.id, t.id, { comment: e.target.value })}
                            placeholder="Comment (optional)"
                            style={{width:'100%', minHeight: 80}}
                          />
                        </td>
                      </tr>
                    )}
                    </>
                  );})}
                  {activeEpic.tasks.length === 0 && (
                    <tr>
                      <td colSpan={5} className="small">No subtasks. Click "Add subtask".</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {value.length === 0 && (
        <div className="small" style={{padding:8}}>No epics. Click "+ Epic".</div>
      )}
    </div>
  );
}
