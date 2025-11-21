"use client";
import { useEffect, useState } from "react";

type Member = {
  id: string;
  user_id: string;
  role: string;
  email: string;
  invited_by_email?: string;
};

type ProjectMembersProps = {
  projectId: string;
  currentUserId: string;
  isOwner: boolean;
};

export default function ProjectMembers({ projectId, currentUserId, isOwner }: ProjectMembersProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
  }, [projectId]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;

      // Получаем участников проекта
      const { data: membersData } = await supabase
        .from("project_members")
        .select("id, user_id, role, invited_by_email")
        .eq("project_id", projectId);

      if (!membersData) {
        setMembers([]);
        return;
      }

      // Получаем email для каждого участника
      const membersWithEmails: Member[] = [];
      for (const member of membersData) {
        const { data: email } = await supabase
          .rpc("get_user_email_by_id", { user_id: member.user_id });
        
        membersWithEmails.push({
          ...member,
          email: email || "Неизвестный",
        });
      }

      setMembers(membersWithEmails);
    } catch (e) {
      console.error("Failed to load members:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (memberId: string, memberUserId: string) => {
    if (memberUserId === currentUserId) {
      alert("Вы не можете удалить себя из проекта");
      return;
    }

    const ok = window.confirm("Удалить пользователя из проекта?");
    if (!ok) return;

    setRemoving(memberId);
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error("Сессия истекла");
      }

      const res = await fetch("/api/remove-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          projectId,
          accessToken: session.access_token,
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Не удалось удалить участника");
      }

      // Обновляем список
      setMembers(members.filter(m => m.id !== memberId));
      alert("Участник удалён");
    } catch (e: any) {
      alert(e?.message || "Не удалось удалить участника");
    } finally {
      setRemoving(null);
    }
  };



  if (loading) {
    return (
      <div className="small" style={{ color: "#64748b" }}>
        Загрузка участников...
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ marginBottom: 8 }}>Участники проекта ({members.length})</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {members.map((member) => (
          <div
            key={member.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              background: "#f8fafc",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{member.email}</div>
              <div className="small" style={{ color: "#64748b" }}>
                {member.role === "owner" ? "Владелец" : "Участник"}
                {member.invited_by_email && ` • Пригласил: ${member.invited_by_email}`}
              </div>
            </div>
            {isOwner && member.role !== "owner" && (
              <button
                className="icon-btn danger"
                onClick={() => handleRemove(member.id, member.user_id)}
                disabled={removing === member.id}
                title="Удалить участника"
              >
                {removing === member.id ? "..." : "✕"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
