"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProjectListItem = {
  id: string;
  name: string;
  created_at: string | null;
};

const supabaseRestUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function HomePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const initFromStorage = async () => {
      if (typeof window === "undefined") return;
      const storedId = localStorage.getItem("estimator_user_id");
      const storedEmail = localStorage.getItem("estimator_user_email");
      if (!active) return;

      if (storedId && storedEmail) {
        setUserId(storedId);
        setUserEmail(storedEmail);
        await loadProjects(storedId);
      } else {
        setUserId(null);
        setUserEmail(null);
      }
    };

    initFromStorage();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session) {
        const nextId = session.user?.id ?? null;
        const nextEmail = session.user?.email ?? null;
        if (typeof window !== "undefined") {
          if (nextId) localStorage.setItem("estimator_user_id", nextId);
          if (nextEmail) localStorage.setItem("estimator_user_email", nextEmail);
        }
        if (nextId) {
          setUserId(nextId);
          setUserEmail(nextEmail ?? null);
          loadProjects(nextId);
        }
      } else {
        setUserId(null);
        setUserEmail(null);
        setProjects([]);
        if (typeof window !== "undefined") {
          localStorage.removeItem("estimator_user_id");
          localStorage.removeItem("estimator_user_email");
        }
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const loadProjects = async (ownerId: string | null) => {
    setProjectsLoading(true);
    try {
      if (!ownerId) {
        setProjects([]);
      } else {
        const url = `${supabaseRestUrl}/projects?select=id,name,created_at&owner_id=eq.${ownerId}`;
        const res = await fetch(url, {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as ProjectListItem[];
        setProjects(data ?? []);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setProjectsLoading(false);
    }
  };

  if (!userEmail) {
    return (
      <div className="viewport">
        <div className="card" style={{ maxWidth: 420, width: "100%" }}>
          <div className="card-header">
            <h2>Требуется вход</h2>
          </div>
          <div className="grid">
            <div className="small" style={{ color: "#64748b" }}>
              Сессия не найдена. Перейдите на страницу входа.
            </div>
            <button className="btn primary" type="button" onClick={() => router.replace("/login")}>Перейти на /login</button>
          </div>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUserId(null);
    setUserEmail(null);
    setProjects([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem("estimator_user_id");
      localStorage.removeItem("estimator_user_email");
    }
    router.replace("/login");
  };

  return (
    <div className="viewport">
      <div className="card" style={{ width: "100%" }}>
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Мои проекты</h2>
            <div className="small">Вы вошли как {userEmail}</div>
          </div>
          <button className="btn" type="button" onClick={handleSignOut}>
            Выйти
          </button>
        </div>
        <div className="grid">
          <div>
            <button
              className="btn primary"
              type="button"
              onClick={() => router.push("/project/new")}
            >
              Создать новый проект
            </button>
          </div>
          <div>
            {projectsLoading ? (
              <div className="small" style={{ color: "#64748b" }}>
                Загрузка проектов...
              </div>
            ) : projects.length === 0 ? (
              <div className="small" style={{ color: "#64748b" }}>
                У вас пока нет проектов. Создайте первый.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                {projects.map((p) => {
                  const dateLabel = p.created_at
                    ? new Date(p.created_at).toLocaleDateString("ru-RU")
                    : "";
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="card"
                      style={{
                        textAlign: "left",
                        padding: 12,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                      onClick={() => router.push(`/project/${p.id}`)}
                    >
                      <div style={{ fontWeight: 600 }}>{p.name || "Без названия"}</div>
                      {dateLabel && (
                        <div className="small" style={{ color: "#64748b" }}>
                          Создан {dateLabel}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
