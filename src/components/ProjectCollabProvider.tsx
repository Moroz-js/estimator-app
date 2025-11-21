"use client";

import { createContext, useContext, useMemo, ReactNode } from "react";
import { useProjectRealtime } from "@/lib/useProjectRealtime";
import type { PresencePayload, RealtimeMessage } from "@/lib/types";

interface ProjectCollabContextValue {
  presence: PresencePayload[];
  editingByTaskId: Record<string, PresencePayload[]>;
  editingByEpicId: Record<string, PresencePayload[]>;
  sendPatch: (message: Omit<RealtimeMessage, "clientId" | "userId" | "timestamp">) => void;
  updatePresence: (patch: Partial<Omit<PresencePayload, "userId" | "email" | "color" | "joinedAt">>) => void;
  isConnected: boolean;
}

const ProjectCollabContext = createContext<ProjectCollabContextValue | null>(null);

interface ProjectCollabProviderProps {
  projectId: string;
  currentUser: {
    id: string;
    email: string;
    displayName?: string;
  };
  onRemotePatch: (message: RealtimeMessage) => void;
  enabled?: boolean;
  children: ReactNode;
}

export function ProjectCollabProvider({
  projectId,
  currentUser,
  onRemotePatch,
  enabled = true,
  children,
}: ProjectCollabProviderProps) {
  const { presenceList, sendPatch, updatePresence, isConnected } = useProjectRealtime({
    projectId,
    currentUser,
    onRemotePatch,
    enabled,
  });

  // Построение карт редактирования
  const { editingByTaskId, editingByEpicId } = useMemo(() => {
    const byTask: Record<string, PresencePayload[]> = {};
    const byEpic: Record<string, PresencePayload[]> = {};

    presenceList.forEach((user) => {
      // Пропускаем текущего пользователя
      if (user.userId === currentUser.id) return;

      // Только если пользователь что-то редактирует
      if (!user.isTyping && !user.currentTaskId && !user.currentEpicId) return;

      if (user.currentTaskId) {
        if (!byTask[user.currentTaskId]) {
          byTask[user.currentTaskId] = [];
        }
        byTask[user.currentTaskId].push(user);
      }

      if (user.currentEpicId) {
        if (!byEpic[user.currentEpicId]) {
          byEpic[user.currentEpicId] = [];
        }
        byEpic[user.currentEpicId].push(user);
      }
    });

    return { editingByTaskId: byTask, editingByEpicId: byEpic };
  }, [presenceList, currentUser.id]);

  const value: ProjectCollabContextValue = {
    presence: presenceList,
    editingByTaskId,
    editingByEpicId,
    sendPatch,
    updatePresence,
    isConnected,
  };

  return (
    <ProjectCollabContext.Provider value={value}>
      {children}
    </ProjectCollabContext.Provider>
  );
}

export function useProjectCollab(): ProjectCollabContextValue {
  const context = useContext(ProjectCollabContext);
  if (!context) {
    throw new Error("useProjectCollab must be used within ProjectCollabProvider");
  }
  return context;
}
