// excelParser.ts - Парсер Excel файлов в формат эпиков
import ExcelJS from "exceljs";
import type { Epic, Subtask, SubtaskType } from "./types";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function parseExcelToEpics(file: File): Promise<Epic[]> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  if (!ws) {
    throw new Error("Файл не содержит листов");
  }

  const epics: Epic[] = [];
  const tempEpics: Epic[] = [];

  // Начинаем с 9 строки (после заголовков)
  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 9) return;

    const tagCell = row.getCell(2);
    const titleCell = row.getCell(3);
    const minCell = row.getCell(4);
    const commentCell = row.getCell(8);

    const tag = tagCell.value?.toString().trim() || "";
    const title = titleCell.value?.toString().trim() || "";
    const min = typeof minCell.value === "number" ? minCell.value : 0;
    const comment = commentCell.value?.toString().trim() || "";

    if (!tag && !title) return;

    if (tag === "EP") {
      const newEpic: Epic = {
        id: uid("epic"),
        title,
        tasks: [],
      };
      tempEpics.push(newEpic);
      return;
    }

    if (tag && tempEpics.length > 0) {
      const validTypes: SubtaskType[] = ["BA", "NC", "DE", ""];
      const taskType: SubtaskType = validTypes.includes(tag as SubtaskType) ? (tag as SubtaskType) : "";

      const task: Subtask = {
        id: uid("t"),
        type: taskType,
        title,
        estimate: min > 0 ? min : undefined,
        comment: comment || undefined,
      };
      
      tempEpics[tempEpics.length - 1].tasks.push(task);
    }
  });

  // Фильтруем эпики с задачами
  for (const epic of tempEpics) {
    if (epic.tasks.length > 0) {
      epics.push(epic);
    }
  }

  return epics;
}
