"use client";
import { useState } from "react";
import type { Epic } from "@/lib/types";
import { parseExcelToEpics } from "@/lib/excelParser";

interface ImportEpicsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (epics: Epic[]) => void;
}

export default function ImportEpicsModal({ isOpen, onClose, onImport }: ImportEpicsModalProps) {
  const [parsedEpics, setParsedEpics] = useState<Epic[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    
    try {
      const epics = await parseExcelToEpics(file);
      
      if (epics.length === 0) {
        setError("Файл не содержит эпиков или имеет неверный формат");
        setParsedEpics([]);
        return;
      }

      setParsedEpics(epics);
      // Автоматически выбираем все эпики
      setSelectedIds(new Set(epics.map(e => e.id)));
    } catch (err) {
      console.error("Parse error:", err);
      setError(err instanceof Error ? err.message : "Ошибка при парсинге файла");
      setParsedEpics([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleImport = () => {
    const selected = parsedEpics.filter(e => selectedIds.has(e.id));
    onImport(selected);
    handleClose();
  };

  const handleClose = () => {
    setParsedEpics([]);
    setSelectedIds(new Set());
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Импорт эпиков из Excel</h3>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>
        <div className="modal-body" style={{ overflowY: parsedEpics.length > 0 ? "auto" : "visible" }}>
          {parsedEpics.length === 0 ? (
            <>
              <p className="small" style={{ marginBottom: 16 }}>
                Выберите Excel файл с эпиками для импорта
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                disabled={loading}
                style={{ marginBottom: 16 }}
              />
              {loading && <p>Парсинг файла...</p>}
              {error && <p style={{ color: "red" }}>{error}</p>}
            </>
          ) : (
            <>
              <p className="small" style={{ marginBottom: 16, color: "#64748b" }}>
                Найдено эпиков: {parsedEpics.length}. Выберите для импорта:
              </p>
              <div>
                {parsedEpics.map((epic) => {
                  const totalHours = epic.tasks.reduce((sum, t) => sum + (t.estimate || 0), 0);
                  const tasksByType = epic.tasks.reduce((acc, t) => {
                    acc[t.type] = (acc[t.type] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>);

                  return (
                    <div
                      key={epic.id}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        marginBottom: 12,
                        overflow: "hidden",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          padding: "12px 16px",
                          background: selectedIds.has(epic.id) ? "#f8fafc" : "#fff",
                          borderBottom: "1px solid #e2e8f0",
                          gap: 12,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(epic.id)}
                          onChange={() => handleToggle(epic.id)}
                          style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, color: "#0f172a" }}>
                            {epic.title}
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span className="small" style={{ color: "#64748b" }}>
                              {epic.tasks.length} задач • {totalHours} ч
                            </span>
                            {Object.entries(tasksByType).map(([type, count]) => (
                              <span
                                key={type}
                                className="small"
                                style={{
                                  color: "#475569",
                                  background: "#f1f5f9",
                                  padding: "2px 8px",
                                  borderRadius: 4,
                                  fontWeight: 500,
                                }}
                              >
                                {type}: {count}
                              </span>
                            ))}
                          </div>
                        </div>
                      </label>
                      <div style={{ padding: "8px 16px 12px 16px", background: "#fafafa" }}>
                        {epic.tasks.map((task, idx) => (
                          <div
                            key={task.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "40px 1fr 60px",
                              gap: 8,
                              padding: "6px 0",
                              fontSize: 13,
                              borderBottom: idx < epic.tasks.length - 1 ? "1px solid #e2e8f0" : "none",
                            }}
                          >
                            <span
                              style={{
                                fontWeight: 600,
                                color: "#475569",
                                background: "#fff",
                                padding: "2px 6px",
                                borderRadius: 4,
                                textAlign: "center",
                                border: "1px solid #e2e8f0",
                              }}
                            >
                              {task.type}
                            </span>
                            <span style={{ color: "#0f172a" }}>{task.title}</span>
                            <span style={{ color: "#64748b", textAlign: "right" }}>
                              {task.estimate || 0}ч
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={handleClose}>
            Отмена
          </button>
          {parsedEpics.length > 0 && (
            <button
              className="btn primary"
              onClick={handleImport}
              disabled={selectedIds.size === 0}
            >
              Импортировать ({selectedIds.size})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
