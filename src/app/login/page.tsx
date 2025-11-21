"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type AuthView = "signIn" | "signUp";

export default function LoginPage() {
  const router = useRouter();
  const [authView, setAuthView] = useState<AuthView>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleAuth = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (authView === "signIn") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const user = data.user ?? data.session?.user ?? null;
        if (user && typeof window !== "undefined") {
          localStorage.setItem("estimator_user_id", user.id);
          if (user.email) {
            localStorage.setItem("estimator_user_email", user.email);
          }
        }
        router.replace("/");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo("Мы отправили письмо для подтверждения. После подтверждения войдите с этим email и паролем.");
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="viewport">
      <div className="card" style={{ maxWidth: 420, width: "100%" }}>
        <div className="card-header">
          <h2>{authView === "signIn" ? "Вход" : "Регистрация"}</h2>
        </div>
        <div className="grid">
          <div>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
            />
          </div>
          {info && !error && (
            <div className="small" style={{ color: "#0f766e" }}>
              {info}
            </div>
          )}
          {error && (
            <div className="small" style={{ color: "#ef4444" }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <button
              className="btn"
              type="button"
              onClick={() => setAuthView(authView === "signIn" ? "signUp" : "signIn")}
            >
              {authView === "signIn" ? "Нет аккаунта? Регистрация" : "Уже есть аккаунт? Войти"}
            </button>
            <button
              className="btn primary"
              type="button"
              onClick={handleAuth}
              disabled={loading || !email || !password}
            >
              {loading ? "Подождите..." : authView === "signIn" ? "Войти" : "Зарегистрироваться"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
