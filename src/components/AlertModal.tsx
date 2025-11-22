"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: "success" | "error" | "info";
}

export default function AlertModal({
  isOpen,
  onClose,
  title,
  message,
  type = "info",
}: AlertModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const colors = {
    success: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
    error: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
    info: { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" },
  };

  const color = colors[type];

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(15, 23, 42, 0.45)",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 101,
          maxWidth: 480,
          width: "90%",
          margin: "20vh auto",
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 20px 60px rgba(2, 6, 23, 0.25)",
        }}
      >
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: color.bg,
            border: `1px solid ${color.border}`,
            borderRadius: 8,
          }}
        >
          <h3
            style={{
              margin: 0,
              marginBottom: 8,
              fontSize: 18,
              fontWeight: 600,
              color: color.text,
            }}
          >
            {title}
          </h3>
          <p style={{ margin: 0, color: color.text, lineHeight: 1.5 }}>
            {message}
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn primary" type="button" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
