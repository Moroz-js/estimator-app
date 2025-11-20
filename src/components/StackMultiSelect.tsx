"use client";
import { useState, KeyboardEvent, ChangeEvent } from "react";

export interface StackMultiSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  presets: string[];
  allowCustom?: boolean;
}

export default function StackMultiSelect({ value, onChange, presets, allowCustom = true }: StackMultiSelectProps) {
  const [custom, setCustom] = useState("");

  const toggle = (item: string) => {
    const has = value.includes(item);
    onChange(has ? value.filter((v) => v !== item) : [...value, item]);
  };

  const addCustom = () => {
    const raw = custom.trim();
    if (!raw) return;
    const prefixed = presets.includes(raw) ? raw : `Custom: ${raw}`;
    if (value.includes(prefixed)) {
      setCustom("");
      return;
    }
    onChange([...value, prefixed]);
    setCustom("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustom();
    }
  };

  return (
    <div className="grid">
      <div className="badges">
        {presets.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`badge ${value.includes(opt) ? "selected" : ""}`}
            onClick={() => toggle(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
      {allowCustom && (
        <div className="input-inline">
          <input
            placeholder="Добавить свой инструмент"
            value={custom}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setCustom(e.target.value)}
            onKeyDown={onKey}
          />
          <button type="button" className="btn" onClick={addCustom}>Добавить</button>
        </div>
      )}
      <div className="small">Выбранные: {value.length ? value.join(", ") : "ничего"}</div>
    </div>
  );
}
