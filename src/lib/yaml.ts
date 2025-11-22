import { AppState, Subtask } from "@/lib/types";

function serializeEstimate(est?: number) {
  if (typeof est === "number" && !Number.isNaN(est)) return est;
  return null;
}

export function generateYaml(state: AppState): string {
  const typeNormalized = String(state.project.type).toLowerCase();
  const data = {
    project: {
      name: state.project.name,
      date: state.project.date,
      type: typeNormalized,
      stack: state.project.stack,
      language: state.project.language || "en",
    },
    epics: state.epics.map((e) => ({
      title: e.title,
      tasks: (e.tasks || []).map((t: Subtask) => ({
        type: t.type,
        title: t.title,
        estimate: serializeEstimate(t.estimate),
        comment: t.comment ?? "",
      })),
    })),
  };

  return JSON.stringify(data, null, 2);
}
