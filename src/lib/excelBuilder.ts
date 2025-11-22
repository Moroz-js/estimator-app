// excelBuilder.ts - Генератор Excel файлов по шаблону Xmethod
import ExcelJS from "exceljs";

export type Subtask = {
  id?: string;
  type: string;
  title: string;
  estimate?: number;
  comment?: string;
};

export type Epic = {
  id?: string;
  title: string;
  tasks: Subtask[];
};

export type Project = {
  name?: string;
  date?: string;
  type?: "Web" | "Mobile";
  stack?: string[];
  language?: "en" | "ru";
};

export type Input = {
  project?: Project;
  epics?: Epic[];
};

function asNumber(val: unknown, def: number): number {
  const n = typeof val === "string" || typeof val === "number" ? Number(val) : NaN;
  return Number.isFinite(n) ? n : def;
}

// ========== КОНФИГУРАЦИЯ ==========

// Информация о компании
const COMPANY_INFO = {
  name: "MVKANE",
  address: "Neumannstr. 135, 13189 Berlin",
  phone: "+49 30 46690238 (WhatsApp)",
  email: "hello@xmethod.de",
  website: "xmethod.de",
};

// Конфигурация языков
interface LanguageConfig {
  // Заголовки
  stack: string;
  date: string;
  tag: string;
  task: string;
  min: string;
  exp: string;
  max: string;
  expected: string;
  comment: string;
  
  // Секция Cost
  cost: string;
  hours: string;
  currency: string;
  currencySymbol: string;
  
  // Роли
  roles: Array<{
    name: string;
    hours: number;
    rate: number;
    bg: string;
  }>;
  
  // Секция Works
  works: string;
  uiuxDesign: string;
  development: string;
  analytics: string;
  projectManagement: string;
  qa: string;
  total: string;
  
  // Disclaimer
  disclaimer: string;
  
  // Листы
  questionsSheet: string;
  linksSheet: string;
  questionHeader: string;
  answerHeader: string;
  nameHeader: string;
  linkHeader: string;
}

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  en: {
    stack: "Stack:",
    date: "Date:",
    tag: "Tag",
    task: "Task",
    min: "Min",
    exp: "Exp",
    max: "Max",
    expected: "Expected",
    comment: "Comment",
    
    cost: "Cost",
    hours: "Hours",
    currency: "EUR",
    currencySymbol: "€",
    
    roles: [
      { name: "[DE] UI/UX Designer", hours: 1, rate: 50, bg: "FFE9E9E9" },
      { name: "[NC] Web/Mobile Developer", hours: 1, rate: 50, bg: "FFFFFFFF" },
      { name: "[PM] Project Manager", hours: 1, rate: 50, bg: "FFE9E9E9" },
      { name: "[QA] QA Engineer", hours: 1, rate: 50, bg: "FFFFFFFF" },
      { name: "[BA] Business Analyst", hours: 1, rate: 70, bg: "FFEFEFEF" },
      { name: "[AD] Art Director", hours: 1, rate: 70, bg: "FFFFFFFF" },
      { name: "[TL] Team Lead", hours: 1, rate: 70, bg: "FFEFEFEF" },
    ],
    
    works: "Works",
    uiuxDesign: "UI/UX Design",
    development: "Development",
    analytics: "Analytics",
    projectManagement: "Project Management",
    qa: "QA",
    total: "Total",
    
    disclaimer: "*The estimate provided is a preliminary assessment of the scope of work and costs based on our current understanding of tasks and requirements.\nThe Min–Max range reflects possible variations in labor costs depending on the clarification of requirements, priorities, changes in functionality, and other factors.\nThe Expected value is an approximate estimate close to the expected volume, but is not a guaranteed cost. Actual payment is made on a Time & Materials basis, based on the actual time spent by the team and according to approved rates. Reports and timesheets are provided every 2 weeks.",
    
    questionsSheet: "Questions",
    linksSheet: "Links",
    questionHeader: "Question",
    answerHeader: "Answer",
    nameHeader: "Name",
    linkHeader: "Link",
  },
  
  ru: {
    stack: "Стек:",
    date: "Дата:",
    tag: "Тег",
    task: "Задача",
    min: "Мин",
    exp: "Ожид",
    max: "Макс",
    expected: "Итого",
    comment: "Комментарий",
    
    cost: "Стоимость",
    hours: "Часы",
    currency: "RUB",
    currencySymbol: "₽",
    
    roles: [
      { name: "[DE] UI/UX Дизайнер", hours: 1, rate: 1200, bg: "FFE9E9E9" },
      { name: "[NC] Веб/Мобильный разработчик", hours: 1, rate: 1200, bg: "FFFFFFFF" },
      { name: "[PM] Проект-менеджер", hours: 1, rate: 1200, bg: "FFE9E9E9" },
      { name: "[QA] QA Инженер", hours: 1, rate: 1200, bg: "FFFFFFFF" },
      { name: "[BA] Бизнес-аналитик", hours: 1, rate: 1680, bg: "FFEFEFEF" },
      { name: "[AD] Арт-директор", hours: 1, rate: 1680, bg: "FFFFFFFF" },
      { name: "[TL] Тимлид", hours: 1, rate: 1680, bg: "FFEFEFEF" },
    ],
    
    works: "Работы",
    uiuxDesign: "UI/UX Дизайн",
    development: "Разработка",
    analytics: "Аналитика",
    projectManagement: "Управление проектом",
    qa: "Тестирование",
    total: "Итого",
    
    disclaimer: "*Предоставленная оценка является предварительной оценкой объема работ и затрат на основе нашего текущего понимания задач и требований.\nДиапазон Мин–Макс отражает возможные вариации трудозатрат в зависимости от уточнения требований, приоритетов, изменений функциональности и других факторов.\nЗначение Итого является приблизительной оценкой, близкой к ожидаемому объему, но не является гарантированной стоимостью. Фактическая оплата производится по модели Time & Materials на основе фактически затраченного времени команды и согласованных ставок. Отчеты и табели предоставляются каждые 2 недели.",
    
    questionsSheet: "Вопросы",
    linksSheet: "Ссылки",
    questionHeader: "Вопрос",
    answerHeader: "Ответ",
    nameHeader: "Название",
    linkHeader: "Ссылка",
  },
};

// ========== ОСНОВНАЯ ФУНКЦИЯ ==========

export async function buildWorkbookFromScratch(inputJson: Input): Promise<Buffer> {
  const project = inputJson.project ?? {};
  const epics = Array.isArray(inputJson.epics) ? inputJson.epics : [];
  
  // Получаем конфигурацию языка
  const lang = project.language || "en";
  const config = LANGUAGE_CONFIGS[lang] || LANGUAGE_CONFIGS.en;
  
  const wb = new ExcelJS.Workbook();

  // ========== ЛИСТ 1: Estimate ==========
  const dateStr = new Date().toLocaleDateString("en-GB").replace(/\//g, ".");
  const projectType = (project.type || "Web").charAt(0).toUpperCase() + (project.type || "Web").slice(1).toLowerCase();
  const ws = wb.addWorksheet(`${projectType} Estimate ${dateStr}`);

  // Отключаем gridlines (сетку) для листа
  ws.views = [{ showGridLines: false }];

  // Ширины колонок (точно как в оригинале)
  ws.getColumn(1).width = 2.63;   // A - узкая
  ws.getColumn(2).width = 8;      // B - Tag
  ws.getColumn(3).width = 58.63;  // C - Task
  ws.getColumn(4).width = 14.25;  // D - Min
  ws.getColumn(5).width = 14.25;  // E - Exp (будет скрыта)
  ws.getColumn(6).width = 14.25;  // F - Max
  ws.getColumn(7).width = 14.25;  // G - Expected
  ws.getColumn(8).width = 16.13;  // H - Comment
  ws.getColumn(9).width = 46;     // I - Comment продолжение
  ws.getColumn(10).width = 3.13;  // J - узкая

  // Скрываем колонку E (Exp)
  ws.getColumn(5).hidden = true;
  
  let row = 1;

  // ========== ШАПКА: Строки 1-5 (белый фон) ==========
  
  // Строка 1: Название компании
  ws.mergeCells(`B${row}:C${row}`);
  ws.getCell(`B${row}`).value = COMPANY_INFO.name;
  ws.getCell(`B${row}`).font = { name: "Roboto", size: 14, bold: true, color: { argb: "FF000000" } };
  ws.getCell(`B${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`B${row}`).alignment = { horizontal: "left", vertical: "bottom" };
  ws.getRow(row).height = 25.5;
  row++;

  // Строка 2: Адрес
  ws.mergeCells(`B${row}:C${row}`);
  ws.getCell(`B${row}`).value = COMPANY_INFO.address;
  ws.getCell(`B${row}`).font = { name: "Roboto", size: 14, color: { argb: "FF000000" } };
  ws.getCell(`B${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`B${row}`).alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(row).height = 20.25;
  row++;

  // Строка 3: Телефон
  ws.mergeCells(`B${row}:C${row}`);
  ws.getCell(`B${row}`).value = COMPANY_INFO.phone;
  ws.getCell(`B${row}`).font = { name: "Roboto", size: 14, color: { argb: "FF000000" } };
  ws.getCell(`B${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`B${row}`).alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(row).height = 20.25;
  row++;

  // Строка 4: Email
  ws.mergeCells(`B${row}:C${row}`);
  ws.getCell(`B${row}`).value = COMPANY_INFO.email;
  ws.getCell(`B${row}`).font = { name: "Roboto", size: 14, color: { argb: "FF000000" } };
  ws.getCell(`B${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`B${row}`).alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(row).height = 20.25;
  row++;

  // Строка 5: Website
  ws.mergeCells(`B${row}:C${row}`);
  ws.getCell(`B${row}`).value = {
    text: COMPANY_INFO.website,
    hyperlink: `https://${COMPANY_INFO.website}/`,
  };
  ws.getCell(`B${row}`).font = { name: "Roboto", size: 14, color: { argb: "FF000000" } };
  ws.getCell(`B${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`B${row}`).alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(row).height = 25.5;
  row++;

  // Объединяем ячейки I3:I4 для логотипа
  ws.mergeCells('I3:I4');

  // ========== ДОБАВЛЕНИЕ ЛОГОТИПА ==========
  try {
    const fs = require('fs');
    const path = require('path');
    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      const logoId = wb.addImage({
        buffer: logoBuffer,
        extension: 'png',
      });
      
      ws.addImage(logoId, 'I3:I4');
    }
  } catch (e) {
    // Логотип не найден, продолжаем без него
  }

  // ========== СТРОКИ 6-7: Название проекта и дата (СИНИЙ ФОН от A до J) ==========
  
  // Строка 6: Название проекта и стек
  for (let col = 1; col <= 10; col++) {
    const cell = ws.getRow(row).getCell(col);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0000FF" } };
  }

  ws.mergeCells(`B${row}:C${row}`);
  ws.getCell(`B${row}`).value = project.name || "Project";
  ws.getCell(`B${row}`).font = { name: "Roboto", size: 20, color: { argb: "FFFFFFFF" } };
  ws.getCell(`B${row}`).alignment = { horizontal: "left", vertical: "middle" };

  ws.getCell(`G${row}`).value = config.stack;
  ws.getCell(`G${row}`).font = { name: "Roboto", size: 16, color: { argb: "FFFFFFFF" } };
  ws.getCell(`G${row}`).alignment = { horizontal: "left", vertical: "middle" };
  ws.getCell(`G${row}`).numFmt = "0";

  ws.mergeCells(`H${row}:I${row}`);
  const cleanStack = (project.stack || []).map(s => s.replace(/^Custom:\s*/i, "")).join(", ");
  ws.getCell(`H${row}`).value = cleanStack;
  ws.getCell(`H${row}`).font = { name: "Roboto", size: 16, color: { argb: "FFFFFFFF" } };
  ws.getCell(`H${row}`).alignment = { horizontal: "left", vertical: "middle" };

  ws.getRow(row).height = 36;
  row++;

  // Строка 7: Дата
  for (let col = 1; col <= 10; col++) {
    const cell = ws.getRow(row).getCell(col);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0000FF" } };
  }

  ws.getCell(`B${row}`).value = config.date;
  ws.getCell(`B${row}`).font = { name: "Roboto", size: 16, color: { argb: "FFFFFFFF" } };
  ws.getCell(`B${row}`).alignment = { horizontal: "left", vertical: "middle", wrapText: false };

  ws.getCell(`C${row}`).value = project.date ? new Date(project.date) : new Date();
  ws.getCell(`C${row}`).font = { name: "Roboto", size: 16, color: { argb: "FFFFFFFF" } };
  ws.getCell(`C${row}`).alignment = { horizontal: "left", vertical: "middle" };
  ws.getCell(`C${row}`).numFmt = "dd.mm.yyyy";

  ws.mergeCells(`H${row}:I${row}`);
  ws.getRow(row).height = 36;
  row++;

  // ========== СТРОКА 8: Заголовки таблицы ==========

  ws.getCell(`A${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };

  ws.getCell(`B${row}`).value = config.tag;
  ws.getCell(`B${row}`).font = { name: "Roboto", size: 14, bold: true, color: { argb: "FF000000" } };
  ws.getCell(`B${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`B${row}`).alignment = { horizontal: "left", vertical: "middle" };

  ws.getCell(`C${row}`).value = config.task;
  ws.getCell(`C${row}`).font = { name: "Roboto", size: 14, bold: true, color: { argb: "FF000000" } };
  ws.getCell(`C${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`C${row}`).alignment = { horizontal: "left", vertical: "middle" };

  ["D", "E", "F", "G"].forEach((col, idx) => {
    const labels = [config.min, config.exp, config.max, config.expected];
    ws.getCell(`${col}${row}`).value = labels[idx];
    ws.getCell(`${col}${row}`).font = { name: "Roboto", size: 14, bold: true, color: { argb: "FF000000" } };
    ws.getCell(`${col}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F3F3" } };
    ws.getCell(`${col}${row}`).alignment = { horizontal: "center", vertical: "middle" };
    ws.getCell(`${col}${row}`).numFmt = "0";
  });

  ws.mergeCells(`H${row}:I${row}`);
  ws.getCell(`H${row}`).value = config.comment;
  ws.getCell(`H${row}`).font = { name: "Roboto", size: 14, bold: true, color: { argb: "FF000000" } };
  ws.getCell(`H${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`H${row}`).alignment = { horizontal: "center", vertical: "middle" };

  ws.getCell(`J${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };

  ws.getRow(row).height = 38.25;
  row++;

  // ========== ДАННЫЕ: Эпики и задачи ==========
  
  for (const epic of epics) {
    const epicRow = row;
    const tasks = Array.isArray(epic.tasks) ? epic.tasks : [];

    // Строка эпика
    ws.getCell(`A${row}`).font = { name: "Arial", size: 12, bold: true };
    ws.getCell(`A${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9FC5E8" } };

    ws.getCell(`B${row}`).value = "EP";
    ws.getCell(`B${row}`).font = { name: "Roboto", size: 12, bold: true, color: { argb: "FF212121" } };
    ws.getCell(`B${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9FC5E8" } };
    ws.getCell(`B${row}`).alignment = { vertical: "bottom", wrapText: true };
    ws.getCell(`B${row}`).border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };

    ws.getCell(`C${row}`).value = epic.title ?? "";
    ws.getCell(`C${row}`).font = { name: "Roboto", size: 12, bold: true, color: { argb: "FF000000" } };
    ws.getCell(`C${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9FC5E8" } };
    ws.getCell(`C${row}`).alignment = { vertical: "bottom" };
    ws.getCell(`C${row}`).border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };

    ["D", "E", "F", "G"].forEach((col) => {
      ws.getCell(`${col}${row}`).font = { name: "Arial", size: 12, bold: true, color: { argb: "00000001" } };
      ws.getCell(`${col}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9FC5E8" } };
      ws.getCell(`${col}${row}`).alignment = { horizontal: "center", vertical: "middle" };
      ws.getCell(`${col}${row}`).numFmt = "0";
      ws.getCell(`${col}${row}`).border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
    });

    ws.mergeCells(`H${row}:I${row}`);
    ws.getCell(`H${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9FC5E8" } };
    ws.getCell(`H${row}`).numFmt = "#,##0";
    ws.getCell(`H${row}`).border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };

    ws.getCell(`J${row}`).font = { name: "Arial", size: 12, bold: true };
    ws.getCell(`J${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9FC5E8" } };

    row++;
    const firstTask = row;

    // Задачи эпика
    for (const task of tasks) {
      const minVal = asNumber(task.estimate, 0);

      ws.getCell(`A${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9FC5E8" } };

      ws.getCell(`B${row}`).value = task.type ?? "";
      ws.getCell(`B${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
      ws.getCell(`B${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
      ws.getCell(`B${row}`).alignment = { wrapText: true };
      ws.getCell(`B${row}`).border = {
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };

      ws.getCell(`C${row}`).value = task.title ?? "";
      ws.getCell(`C${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF000000" } };
      ws.getCell(`C${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
      ws.getCell(`C${row}`).alignment = { vertical: "bottom" };
      ws.getCell(`C${row}`).border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };

      ws.getCell(`D${row}`).value = minVal || null;
      ws.getCell(`D${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
      ws.getCell(`D${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F3F3" } };
      ws.getCell(`D${row}`).alignment = { horizontal: "center", vertical: "middle" };
      ws.getCell(`D${row}`).numFmt = "0";
      ws.getCell(`D${row}`).border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };

      if (minVal) {
        ws.getCell(`E${row}`).value = { formula: `D${row}*1.25` };
      }
      ws.getCell(`E${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
      ws.getCell(`E${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F3F3" } };
      ws.getCell(`E${row}`).alignment = { horizontal: "center", vertical: "middle" };
      ws.getCell(`E${row}`).numFmt = "#,##0";
      ws.getCell(`E${row}`).border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };

      if (minVal) {
        ws.getCell(`F${row}`).value = { formula: `D${row}*1.45` };
      }
      ws.getCell(`F${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
      ws.getCell(`F${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F3F3" } };
      ws.getCell(`F${row}`).alignment = { horizontal: "center", vertical: "middle" };
      ws.getCell(`F${row}`).numFmt = "#,##0";
      ws.getCell(`F${row}`).border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };

      if (minVal) {
        ws.getCell(`G${row}`).value = { formula: `round((D${row}+(E${row}*4)+F${row})/5.8,0)` };
      }
      ws.getCell(`G${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
      ws.getCell(`G${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F3F3" } };
      ws.getCell(`G${row}`).alignment = { horizontal: "center", vertical: "middle" };
      ws.getCell(`G${row}`).numFmt = "#,##0";
      ws.getCell(`G${row}`).border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };

      ws.mergeCells(`H${row}:I${row}`);
      ws.getCell(`H${row}`).value = task.comment ?? "";
      ws.getCell(`H${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF000000" } };
      ws.getCell(`H${row}`).fill = { type: "pattern", pattern: "none" };
      ws.getCell(`H${row}`).alignment = { vertical: "bottom" };
      ws.getCell(`H${row}`).numFmt = "#,##0";
      ws.getCell(`H${row}`).border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };

      ws.getCell(`J${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9FC5E8" } };

      row++;
    }

    const lastTask = row - 1;

    // Формулы итогов для эпика
    if (tasks.length > 0) {
      ws.getCell(`D${epicRow}`).value = { formula: `SUM(D${firstTask}:D${lastTask})` };
      ws.getCell(`E${epicRow}`).value = { formula: `SUM(E${firstTask}:E${lastTask})` };
      ws.getCell(`F${epicRow}`).value = { formula: `SUM(F${firstTask}:F${lastTask})` };
      ws.getCell(`G${epicRow}`).value = { formula: `SUM(G${firstTask}:G${lastTask})` };
    }
  }

  // ========== СИНЯЯ СТРОКА ПОСЛЕ ТАБЛИЦЫ ==========
  
  for (let col = 1; col <= 10; col++) {
    ws.getRow(row).getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9FC5E8" } };
  }
  row++;

  // Пустая строка
  row++;

  // ========== СЕКЦИЯ COST ==========
  ws.mergeCells(`D${row}:G${row}`);
  ws.getCell(`D${row}`).value = config.cost;
  ws.getCell(`D${row}`).font = { name: "Roboto", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell(`D${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0000FF" } };
  ws.getCell(`D${row}`).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  ws.getCell(`D${row}`).numFmt = "0";

  ws.getCell(`H${row}`).value = config.hours;
  ws.getCell(`H${row}`).font = { name: "Roboto", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell(`H${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0000FF" } };
  ws.getCell(`H${row}`).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  ws.getCell(`I${row}`).value = config.currency;
  ws.getCell(`I${row}`).font = { name: "Roboto", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell(`I${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0000FF" } };
  ws.getCell(`I${row}`).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  ws.getRow(row).height = 56.25;
  row++;

  // Роли и стоимость
  const roleRowStart = row;
  const roleRows: { [key: string]: number } = {};

  config.roles.forEach((role, idx) => {
    // Сохраняем номер строки для каждой роли по коду (DE, NC, PM, QA, BA, AD, TL)
    const roleCode = role.name.match(/\[([A-Z]+)\]/)?.[1] || "";
    roleRows[roleCode] = row;

    // A, B, C - белый фон
    ws.getCell(`A${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
    ws.getCell(`B${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
    ws.getCell(`C${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };

    // D-G - название роли с чередующимся фоном
    ws.getCell(`D${row}`).value = role.name;
    ws.getCell(`D${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
    ws.getCell(`D${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: role.bg } };
    ws.getCell(`D${row}`).numFmt = "0";

    ["E", "F", "G"].forEach((col) => {
      ws.getCell(`${col}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: role.bg } };
      ws.getCell(`${col}${row}`).numFmt = "0";
    });

    // H - часы
    ws.getCell(`H${row}`).value = role.hours;
    ws.getCell(`H${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
    ws.getCell(`H${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: role.bg } };
    ws.getCell(`H${row}`).alignment = { horizontal: "center" };
    ws.getCell(`H${row}`).numFmt = "#,##0";

    // I - стоимость
    ws.getCell(`I${row}`).value = role.rate;
    ws.getCell(`I${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
    ws.getCell(`I${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: role.bg } };
    ws.getCell(`I${row}`).alignment = { horizontal: "center" };
    ws.getCell(`I${row}`).numFmt = "#,##0";

    // J - белый фон
    ws.getCell(`J${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };

    ws.getRow(row).height = 17.25;
    row++;
  });

  // Пустая строка
  row++;

  // ========== СЕКЦИЯ WORKS ==========
  const worksRow = row;
  ws.getCell(`D${row}`).value = config.works;
  ws.getCell(`D${row}`).font = { name: "Roboto", size: 13, bold: true, color: { argb: "FF212121" } };
  ws.getCell(`D${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  ws.getCell(`D${row}`).alignment = { horizontal: "left", vertical: "middle" };
  ws.getCell(`D${row}`).numFmt = "0";

  ["E", "F", "G"].forEach((col) => {
    ws.getCell(`${col}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    ws.getCell(`${col}${row}`).numFmt = "0";
  });

  ws.getCell(`H${row}`).value = { formula: `ROUNDDOWN(SUMIF(B:B,"EP",G:G),0)` };
  ws.getCell(`H${row}`).font = { name: "Roboto", size: 13, bold: true, color: { argb: "FF212121" } };
  ws.getCell(`H${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  ws.getCell(`H${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`H${row}`).numFmt = "#,##0";

  ws.getCell(`I${row}`).value = { formula: `H${row}*I$${roleRows.DE || roleRowStart}` };
  ws.getCell(`I${row}`).font = { name: "Roboto", size: 13, bold: true, color: { argb: "FF212121" } };
  ws.getCell(`I${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  ws.getCell(`I${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`I${row}`).numFmt = `"${config.currencySymbol}"#,##0`;

  ws.getRow(row).height = 17.25;
  row++;

  // UI/UX Design
  ws.getCell(`D${row}`).value = config.uiuxDesign;
  ws.getCell(`D${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
  ws.getCell(`D${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`D${row}`).alignment = { horizontal: "left", vertical: "middle" };
  ws.getCell(`D${row}`).numFmt = "0";

  ["E", "F", "G"].forEach((col) => {
    ws.getCell(`${col}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
    ws.getCell(`${col}${row}`).numFmt = "0";
  });

  ws.getCell(`H${row}`).value = { formula: `ROUNDDOWN(SUMIF(B:B,"DE",G:G),0)` };
  ws.getCell(`H${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
  ws.getCell(`H${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`H${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`H${row}`).numFmt = "#,##0";

  ws.getCell(`I${row}`).value = { formula: `H${row}*I$${roleRows.DE || roleRowStart}` };
  ws.getCell(`I${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
  ws.getCell(`I${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`I${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`I${row}`).numFmt = `"${config.currencySymbol}"#,##0`;

  ws.getRow(row).height = 17.25;
  row++;

  // Development
  const developmentRow = row;
  ws.getCell(`D${row}`).value = config.development;
  ws.getCell(`D${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
  ws.getCell(`D${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  ws.getCell(`D${row}`).alignment = { horizontal: "left", vertical: "middle" };
  ws.getCell(`D${row}`).numFmt = "0";

  ["E", "F", "G"].forEach((col) => {
    ws.getCell(`${col}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    ws.getCell(`${col}${row}`).numFmt = "0";
  });

  ws.getCell(`H${row}`).value = { formula: `ROUNDDOWN(SUMIF(B:B,"NC",G:G),0)` };
  ws.getCell(`H${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
  ws.getCell(`H${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  ws.getCell(`H${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`H${row}`).numFmt = "#,##0";

  ws.getCell(`I${row}`).value = { formula: `H${row}*I$${roleRows.NC || (roleRowStart + 1)}` };
  ws.getCell(`I${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
  ws.getCell(`I${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  ws.getCell(`I${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`I${row}`).numFmt = `"${config.currencySymbol}"#,##0`;

  ws.getRow(row).height = 17.25;
  row++;

  // Analytics
  ws.getCell(`D${row}`).value = config.analytics;
  ws.getCell(`D${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
  ws.getCell(`D${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`D${row}`).alignment = { horizontal: "left", vertical: "middle" };
  ws.getCell(`D${row}`).numFmt = "0";

  ["E", "F", "G"].forEach((col) => {
    ws.getCell(`${col}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
    ws.getCell(`${col}${row}`).numFmt = "0";
  });

  ws.getCell(`H${row}`).value = { formula: `ROUNDDOWN(SUMIF(B:B,"BA",G:G),0)` };
  ws.getCell(`H${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
  ws.getCell(`H${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`H${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`H${row}`).numFmt = "#,##0";

  ws.getCell(`I${row}`).value = { formula: `H${row}*I$${roleRows.BA || (roleRowStart + 4)}` };
  ws.getCell(`I${row}`).font = { name: "Roboto", size: 11, color: { argb: "FF212121" } };
  ws.getCell(`I${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`I${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`I${row}`).numFmt = `"${config.currencySymbol}"#,##0`;

  ws.getRow(row).height = 17.25;
  row++;

  // Project Management
  const pmRow = row;
  ws.getCell(`D${row}`).value = config.projectManagement;
  ws.getCell(`D${row}`).font = { name: "Roboto", size: 13, bold: true, color: { argb: "FF212121" } };
  ws.getCell(`D${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  ws.getCell(`D${row}`).alignment = { horizontal: "left", vertical: "middle" };
  ws.getCell(`D${row}`).numFmt = "0";

  ["E", "F", "G"].forEach((col) => {
    ws.getCell(`${col}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    ws.getCell(`${col}${row}`).numFmt = "0";
  });

  // PM часы = Works часы * 0.33
  ws.getCell(`H${row}`).value = { formula: `ROUNDDOWN(H${worksRow}*0.33,0)` };
  ws.getCell(`H${row}`).font = { name: "Roboto", size: 13, bold: true, color: { argb: "FF212121" } };
  ws.getCell(`H${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  ws.getCell(`H${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`H${row}`).numFmt = "#,##0";

  ws.getCell(`I${row}`).value = { formula: `H${row}*I$${roleRows.PM || (roleRowStart + 2)}` };
  ws.getCell(`I${row}`).font = { name: "Roboto", size: 13, bold: true, color: { argb: "FF212121" } };
  ws.getCell(`I${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  ws.getCell(`I${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`I${row}`).numFmt = `"${config.currencySymbol}"#,##0`;

  ws.getRow(row).height = 17.25;
  row++;

  // QA
  const qaRow = row;
  ws.getCell(`D${row}`).value = config.qa;
  ws.getCell(`D${row}`).font = { name: "Roboto", size: 13, bold: true, color: { argb: "FF212121" } };
  ws.getCell(`D${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`D${row}`).alignment = { horizontal: "left", vertical: "middle" };
  ws.getCell(`D${row}`).numFmt = "0";

  ["E", "F", "G"].forEach((col) => {
    ws.getCell(`${col}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
    ws.getCell(`${col}${row}`).numFmt = "0";
  });

  // QA часы = Development часы * 0.25
  ws.getCell(`H${row}`).value = { formula: `ROUNDDOWN(H${developmentRow}*0.25,0)` };
  ws.getCell(`H${row}`).font = { name: "Roboto", size: 13, bold: true, color: { argb: "FF212121" } };
  ws.getCell(`H${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`H${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`H${row}`).numFmt = "#,##0";

  ws.getCell(`I${row}`).value = { formula: `H${row}*I$${roleRows.QA || (roleRowStart + 3)}` };
  ws.getCell(`I${row}`).font = { name: "Roboto", size: 13, bold: true, color: { argb: "FF212121" } };
  ws.getCell(`I${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(`I${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`I${row}`).numFmt = `"${config.currencySymbol}"#,##0`;

  ws.getRow(row).height = 17.25;
  row++;

  // Пустая строка перед Total
  row++;

  // Total
  const totalRow = row;
  ws.getCell(`D${row}`).value = config.total;
  ws.getCell(`D${row}`).font = { name: "Roboto", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell(`D${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0000FF" } };
  ws.getCell(`D${row}`).alignment = { horizontal: "left", vertical: "middle" };
  ws.getCell(`D${row}`).numFmt = "0";

  ["E", "F", "G"].forEach((col) => {
    ws.getCell(`${col}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0000FF" } };
    ws.getCell(`${col}${row}`).numFmt = "0";
  });

  // Total часы = Works + PM + QA
  ws.getCell(`H${row}`).value = { formula: `H${worksRow}+H${pmRow}+H${qaRow}` };
  ws.getCell(`H${row}`).font = { name: "Roboto", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell(`H${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0000FF" } };
  ws.getCell(`H${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`H${row}`).numFmt = "#,##0";

  // Total стоимость = Works + PM + QA
  ws.getCell(`I${row}`).value = { formula: `I${worksRow}+I${pmRow}+I${qaRow}` };
  ws.getCell(`I${row}`).font = { name: "Roboto", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell(`I${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0000FF" } };
  ws.getCell(`I${row}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`I${row}`).numFmt = `"${config.currencySymbol}"#,##0`;

  ws.getRow(row).height = 30;
  row++;

  // ========== DISCLAIMER ==========
  ws.mergeCells(`D${row}:I${row + 5}`);
  ws.getCell(`D${row}`).value = config.disclaimer;
  ws.getCell(`D${row}`).font = { name: "Roboto", size: 8, color: { argb: "FF808080" } };
  ws.getCell(`D${row}`).alignment = { horizontal: "left", vertical: "top", wrapText: true };
  ws.getRow(row).height = 90;

  // ========== ЛИСТ 2: Questions ==========
  const wsQuestions = wb.addWorksheet(config.questionsSheet);
  wsQuestions.views = [{ showGridLines: false }];

  wsQuestions.getColumn(1).width = 2.63;
  wsQuestions.getColumn(2).width = 58.63;
  wsQuestions.getColumn(3).width = 58.63;
  wsQuestions.getColumn(4).width = 3.13;

  let qRow = 1;

  // Заголовки
  wsQuestions.getCell(`B${qRow}`).value = config.questionHeader;
  wsQuestions.getCell(`B${qRow}`).font = { name: "Roboto", size: 14, bold: true, color: { argb: "FF000000" } };
  wsQuestions.getCell(`B${qRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  wsQuestions.getCell(`B${qRow}`).alignment = { horizontal: "left", vertical: "middle" };

  wsQuestions.getCell(`C${qRow}`).value = config.answerHeader;
  wsQuestions.getCell(`C${qRow}`).font = { name: "Roboto", size: 14, bold: true, color: { argb: "FF000000" } };
  wsQuestions.getCell(`C${qRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  wsQuestions.getCell(`C${qRow}`).alignment = { horizontal: "left", vertical: "middle" };

  wsQuestions.getRow(qRow).height = 38.25;
  qRow++;

  // Пустые строки для вопросов
  for (let i = 0; i < 10; i++) {
    wsQuestions.getCell(`B${qRow}`).border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
    wsQuestions.getCell(`C${qRow}`).border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
    wsQuestions.getRow(qRow).height = 30;
    qRow++;
  }

  // ========== ЛИСТ 3: Links ==========
  const wsLinks = wb.addWorksheet(config.linksSheet);
  wsLinks.views = [{ showGridLines: false }];

  wsLinks.getColumn(1).width = 2.63;
  wsLinks.getColumn(2).width = 58.63;
  wsLinks.getColumn(3).width = 58.63;
  wsLinks.getColumn(4).width = 3.13;

  let lRow = 1;

  // Заголовки
  wsLinks.getCell(`B${lRow}`).value = config.nameHeader;
  wsLinks.getCell(`B${lRow}`).font = { name: "Roboto", size: 14, bold: true, color: { argb: "FF000000" } };
  wsLinks.getCell(`B${lRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  wsLinks.getCell(`B${lRow}`).alignment = { horizontal: "left", vertical: "middle" };

  wsLinks.getCell(`C${lRow}`).value = config.linkHeader;
  wsLinks.getCell(`C${lRow}`).font = { name: "Roboto", size: 14, bold: true, color: { argb: "FF000000" } };
  wsLinks.getCell(`C${lRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  wsLinks.getCell(`C${lRow}`).alignment = { horizontal: "left", vertical: "middle" };

  wsLinks.getRow(lRow).height = 38.25;
  lRow++;

  // Пустые строки для ссылок
  for (let i = 0; i < 10; i++) {
    wsLinks.getCell(`B${lRow}`).border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
    wsLinks.getCell(`C${lRow}`).border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
    wsLinks.getRow(lRow).height = 30;
    lRow++;
  }

  // ========== ВОЗВРАТ БУФЕРА ==========
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
