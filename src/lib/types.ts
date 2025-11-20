export type ProjectType = "Web" | "Mobile";
export type SubtaskType = "" | "BA" | "NC" | "DE";

export interface ProjectMeta {
  name: string;
  date: string; // YYYY-MM-DD
  type: ProjectType;
  stack: string[];
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
