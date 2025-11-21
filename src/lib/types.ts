export type ProjectType = "Web" | "Mobile";
export type SubtaskType = "" | "BA" | "NC" | "DE";
export type ProjectLanguage = "en" | "ru";

export interface ProjectMeta {
  name: string;
  date: string; // YYYY-MM-DD
  type: ProjectType;
  stack: string[];
  language: ProjectLanguage;
}

export interface Subtask {
  id: string;
  type: SubtaskType;
  title: string;
  estimate?: number;
  comment?: string;
}

export interface Epic {
  id: string;
  title: string;
  tasks: Subtask[];
}

export interface AppState {
  project: ProjectMeta;
  epics: Epic[];
}

// ============================================
// REALTIME COLLABORATION TYPES
// ============================================

export interface PresencePayload {
  userId: string;
  email: string;
  displayName?: string;
  color: string;
  joinedAt: string;
  currentEpicId?: string;
  currentTaskId?: string;
  isTyping?: boolean;
}

export type RealtimeEventType =
  | "project_meta_update"
  | "epic_create"
  | "epic_update"
  | "epic_delete"
  | "epic_reorder"
  | "task_create"
  | "task_update"
  | "task_delete"
  | "task_reorder";

export interface RealtimeBaseMessage {
  type: RealtimeEventType;
  clientId: string;
  userId: string;
  timestamp: number;
}

export interface ProjectMetaUpdateMessage extends RealtimeBaseMessage {
  type: "project_meta_update";
  payload: Partial<ProjectMeta>;
}

export interface EpicCreateMessage extends RealtimeBaseMessage {
  type: "epic_create";
  epic: Epic;
}

export interface EpicUpdateMessage extends RealtimeBaseMessage {
  type: "epic_update";
  epicId: string;
  payload: Partial<Epic>;
}

export interface EpicDeleteMessage extends RealtimeBaseMessage {
  type: "epic_delete";
  epicId: string;
}

export interface EpicReorderMessage extends RealtimeBaseMessage {
  type: "epic_reorder";
  epicOrder: string[];
}

export interface TaskCreateMessage extends RealtimeBaseMessage {
  type: "task_create";
  epicId: string;
  task: Subtask;
}

export interface TaskUpdateMessage extends RealtimeBaseMessage {
  type: "task_update";
  epicId: string;
  taskId: string;
  payload: Partial<Subtask>;
}

export interface TaskDeleteMessage extends RealtimeBaseMessage {
  type: "task_delete";
  epicId: string;
  taskId: string;
}

export interface TaskReorderMessage extends RealtimeBaseMessage {
  type: "task_reorder";
  epicId: string;
  taskOrder: string[];
}

export type RealtimeMessage =
  | ProjectMetaUpdateMessage
  | EpicCreateMessage
  | EpicUpdateMessage
  | EpicDeleteMessage
  | EpicReorderMessage
  | TaskCreateMessage
  | TaskUpdateMessage
  | TaskDeleteMessage
  | TaskReorderMessage;
