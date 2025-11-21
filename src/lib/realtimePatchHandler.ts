import type { AppState, Epic, Subtask, RealtimeMessage } from "./types";

/**
 * Применяет remote patch к состоянию приложения
 * Возвращает новое состояние или null если патч не применим
 */
export function applyRemotePatch(
  currentState: AppState,
  message: RealtimeMessage,
  timestamps: {
    projectMeta: number;
    epics: Map<string, number>;
    tasks: Map<string, number>;
  }
): AppState | null {
  // Проверяем timestamp для разрешения конфликтов
  switch (message.type) {
    case "project_meta_update": {
      if (message.timestamp < timestamps.projectMeta) {
        return null; // Локальная версия новее
      }
      timestamps.projectMeta = message.timestamp;
      return {
        ...currentState,
        project: {
          ...currentState.project,
          ...message.payload,
        },
      };
    }

    case "epic_create": {
      // Проверяем, не существует ли уже такой эпик
      if (currentState.epics.some((e) => e.id === message.epic.id)) {
        return null;
      }
      timestamps.epics.set(message.epic.id, message.timestamp);
      return {
        ...currentState,
        epics: [...currentState.epics, message.epic],
      };
    }

    case "epic_update": {
      const epicTimestamp = timestamps.epics.get(message.epicId) || 0;
      if (message.timestamp < epicTimestamp) {
        return null;
      }
      timestamps.epics.set(message.epicId, message.timestamp);

      return {
        ...currentState,
        epics: currentState.epics.map((epic) =>
          epic.id === message.epicId
            ? { ...epic, ...message.payload }
            : epic
        ),
      };
    }

    case "epic_delete": {
      timestamps.epics.delete(message.epicId);
      // Удаляем также timestamps всех задач этого эпика
      currentState.epics
        .find((e) => e.id === message.epicId)
        ?.tasks.forEach((t) => timestamps.tasks.delete(t.id));

      return {
        ...currentState,
        epics: currentState.epics.filter((epic) => epic.id !== message.epicId),
      };
    }

    case "epic_reorder": {
      // Создаём карту существующих эпиков
      const epicMap = new Map(currentState.epics.map((e) => [e.id, e]));
      
      // Строим новый массив в порядке из сообщения
      const reordered: Epic[] = [];
      message.epicOrder.forEach((id) => {
        const epic = epicMap.get(id);
        if (epic) {
          reordered.push(epic);
          epicMap.delete(id);
        }
      });

      // Добавляем эпики, которых не было в списке (на случай рассинхрона)
      epicMap.forEach((epic) => reordered.push(epic));

      return {
        ...currentState,
        epics: reordered,
      };
    }

    case "task_create": {
      // Проверяем, не существует ли уже такая задача
      const epic = currentState.epics.find((e) => e.id === message.epicId);
      if (!epic) return null;
      if (epic.tasks.some((t) => t.id === message.task.id)) {
        return null;
      }

      timestamps.tasks.set(message.task.id, message.timestamp);

      return {
        ...currentState,
        epics: currentState.epics.map((e) =>
          e.id === message.epicId
            ? { ...e, tasks: [...e.tasks, message.task] }
            : e
        ),
      };
    }

    case "task_update": {
      const taskTimestamp = timestamps.tasks.get(message.taskId) || 0;
      if (message.timestamp < taskTimestamp) {
        return null;
      }
      timestamps.tasks.set(message.taskId, message.timestamp);

      return {
        ...currentState,
        epics: currentState.epics.map((epic) =>
          epic.id === message.epicId
            ? {
                ...epic,
                tasks: epic.tasks.map((task) =>
                  task.id === message.taskId
                    ? { ...task, ...message.payload }
                    : task
                ),
              }
            : epic
        ),
      };
    }

    case "task_delete": {
      timestamps.tasks.delete(message.taskId);

      return {
        ...currentState,
        epics: currentState.epics.map((epic) =>
          epic.id === message.epicId
            ? {
                ...epic,
                tasks: epic.tasks.filter((task) => task.id !== message.taskId),
              }
            : epic
        ),
      };
    }

    case "task_reorder": {
      const epic = currentState.epics.find((e) => e.id === message.epicId);
      if (!epic) return null;

      // Создаём карту существующих задач
      const taskMap = new Map(epic.tasks.map((t) => [t.id, t]));
      
      // Строим новый массив в порядке из сообщения
      const reordered: Subtask[] = [];
      message.taskOrder.forEach((id) => {
        const task = taskMap.get(id);
        if (task) {
          reordered.push(task);
          taskMap.delete(id);
        }
      });

      // Добавляем задачи, которых не было в списке
      taskMap.forEach((task) => reordered.push(task));

      return {
        ...currentState,
        epics: currentState.epics.map((e) =>
          e.id === message.epicId ? { ...e, tasks: reordered } : e
        ),
      };
    }

    default:
      return null;
  }
}
