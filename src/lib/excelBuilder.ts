// excelBuilder.ts
import ExcelJS from "exceljs";

export type Subtask = { type: string; title: string; estimate?: number; comment?: string };
export type Epic = { title: string; tasks: Subtask[] };
export type Project = { name?: string; date?: string; type?: "web" | "mobile"; stack?: string[] };
export type Input = { project?: Project; epics?: Epic[] };

function asNumber(val: unknown, def: number): number {
  const n = typeof val === "string" || typeof val === "number" ? Number(val) : NaN;
  return Number.isFinite(n) ? n : def;
}

/* ===== Стили ===== */

const COLOR_TEXT_DARK = "FF212121";
const COLOR_WHITE = "FFFFFFFF";
const COLOR_GRAY_BG = "FFF3F3F3";
const COLOR_EPIC_BG = "FF9FC5E8";

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell, col) => {
    const isNumberCol = col >= 3 && col <= 6; // Min / Exp / Max / Expected

    cell.font = {
      name: "Roboto",
      size: 14,
      bold: true,
      color: { argb: COLOR_TEXT_DARK },
    };

    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isNumberCol ? COLOR_GRAY_BG : COLOR_WHITE },
    };

    if (col === 1 || col === 2) {
      cell.alignment = { horizontal: "left", vertical: "middle" };
    } else {
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }

    if (isNumberCol) {
      cell.numFmt = "0";
    }

    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });
}

function styleEpicRow(row: ExcelJS.Row) {
  for (let col = 1; col <= 7; col++) {
    const cell = row.getCell(col);

    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR_EPIC_BG },
    };

    cell.font = {
      name: "Roboto",
      size: 12,
      bold: true,
      color: { argb: COLOR_TEXT_DARK },
    };

    cell.alignment = {
      horizontal: col <= 2 ? "left" : "center",
      vertical: "middle",
      wrapText: col === 2,
    };

    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  }
}

function styleTaskRow(row: ExcelJS.Row) {
  for (let col = 1; col <= 7; col++) {
    const cell = row.getCell(col);

    cell.font = {
      name: "Roboto",
      size: 11,
      bold: false,
      color: { argb: "FF000000" },
    };

    if (col >= 3 && col <= 6) {
      // Min / Exp / Max / Expected — серый фон
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLOR_GRAY_BG },
      };
    } else {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLOR_WHITE },
      };
    }

    if (col === 2 || col === 7) {
      cell.alignment = {
        horizontal: "left",
        vertical: "bottom",
        wrapText: true,
      };
    } else if (col === 1) {
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
      };
    } else {
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
      };
    }

    // сетка
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // форматы чисел
    if (col === 3) cell.numFmt = "0"; // Min
    if (col === 4 || col === 5 || col === 6) cell.numFmt = "#,##0"; // Exp/Max/Expected
  }
}

/* ===== Основная функция ===== */

export async function buildWorkbookFromScratch(inputJson: Input): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Estimate");

  const project = inputJson.project ?? {};

  // Шапка проекта
  ws.mergeCells("A1", "E1");
  ws.getCell("A1").value = project.name || "Project estimate";
  ws.getCell("A1").font = { name: "Roboto", bold: true, size: 16 };

  ws.getCell("A3").value = "Date:";
  ws.getCell("B3").value = project.date || "";
  ws.getCell("A4").value = "Stack:";
  ws.getCell("B4").value = (project.stack || []).join(", ");

  // Немного вертикального воздуха
  ws.addRow([]);
  ws.addRow([]);

  // Заголовок таблицы (без Epic Key)
  const headerRow = ws.addRow([
    "Tag",
    "Task",
    "Min",
    "Exp",
    "Max",
    "Expected",
    "Comment",
  ]);
  styleHeaderRow(headerRow);

  // Ширины колонок
  ws.columns = [
    { key: "tag", width: 7 },      // A
    { key: "task", width: 60 },    // B
    { key: "min", width: 10 },     // C
    { key: "exp", width: 10 },     // D
    { key: "max", width: 10 },     // E
    { key: "expected", width: 12 },// F
    { key: "comment", width: 40 }, // G
  ];

  const headerRowIndex = headerRow.number;
  const firstDataRow = headerRowIndex + 1;

  const epics = Array.isArray(inputJson.epics) ? inputJson.epics : [];
  let curRow = firstDataRow;

  for (let epIndex = 0; epIndex < epics.length; epIndex++) {
    const epic = epics[epIndex];

    // строка эпика
    const epicRow = ws.getRow(curRow);
    epicRow.getCell(1).value = "EP";             // Tag
    epicRow.getCell(2).value = epic.title ?? ""; // Task (название эпика)
    styleEpicRow(epicRow);

    curRow++;

    const firstChild = curRow;
    let lastChild = curRow - 1;

    const tasks = Array.isArray(epic.tasks) ? epic.tasks : [];
    for (const t of tasks) {
      const row = ws.getRow(curRow);
      const minVal = asNumber(t.estimate, 0);
      const rowIdx = curRow;

      const colMin = "C";
      const colExp = "D";
      const colMax = "E";
      const colExpected = "F";

      row.getCell(1).value = t.type ?? "";   // Tag (NC / DE и т.п.)
      row.getCell(2).value = t.title ?? "";  // Task
      row.getCell(3).value = minVal || null; // Min — ввод пользователя

      if (minVal) {
        // Exp = Min * 1.25
        row.getCell(4).value = {
          formula: `${colMin}${rowIdx}*1.25`,
        };
        // Max = Min * 1.45
        row.getCell(5).value = {
          formula: `${colMin}${rowIdx}*1.45`,
        };
        // Expected = ROUND((Min + 4 * Exp + Max) / 5.8, 0)
        row.getCell(6).value = {
          formula: `ROUND((${colMin}${rowIdx}+4*${colExp}${rowIdx}+${colMax}${rowIdx})/5.8,0)`,
        };
      } else {
        row.getCell(4).value = null;
        row.getCell(5).value = null;
        row.getCell(6).value = null;
      }

      row.getCell(7).value = t.comment ?? ""; // Comment

      styleTaskRow(row);

      lastChild = curRow;
      curRow++;
    }

    // Итоги по эпику — просто SUM по строкам детей
    if (firstChild <= lastChild) {
      const cMin = "C";
      const cExp = "D";
      const cMax = "E";
      const cExpected = "F";

      epicRow.getCell(3).value = {
        formula: `SUM(${cMin}${firstChild}:${cMin}${lastChild})`,
      };
      epicRow.getCell(4).value = {
        formula: `SUM(${cExp}${firstChild}:${cExp}${lastChild})`,
      };
      epicRow.getCell(5).value = {
        formula: `SUM(${cMax}${firstChild}:${cMax}${lastChild})`,
      };
      epicRow.getCell(6).value = {
        formula: `SUM(${cExpected}${firstChild}:${cExpected}${lastChild})`,
      };

      // чтобы стиль не слетел после записи формул
      styleEpicRow(epicRow);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
