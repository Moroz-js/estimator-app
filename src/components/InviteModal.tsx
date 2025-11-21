"use client";
import { useState, useEffect } from "react";

type InviteModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (email: string) => Promise<void>;
};

export default function InviteModal({ isOpen, onClose, onInvite }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !inviting) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, inviting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setInviting(true);
    try {
      await onInvite(email.trim().toLowerCase());
      setEmail("");
      onClose();
    } catch (error) {
      // Ошибка обрабатывается в родительском компоненте
    } finally {
      setInviting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
        animation: "fadeIn 0.2s ease",
      }}
      onClick={handleBackdropClick}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 480,
          margin: 0,
          animation: "fadeUp 0.25s ease",
        }}
      >
        <div className="card-header">
          <h2>Пригласить пользователя</h2>
          <div className="small" style={{ color: "#64748b" }}>
            Введите email зарегистрированного пользователя
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid">
            <div>
              <label>Email пользователя *</label>
              <input
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
                disabled={inviting}
              />
              <div className="small" style={{ color: "#64748b", marginTop: 6 }}>
                Приглашённый пользователь сможет редактировать проект, но не сможет приглашать других
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn"
                onClick={onClose}
                disabled={inviting}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={inviting || !email.trim()}
              >
                {inviting ? "Приглашение..." : "Пригласить"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
