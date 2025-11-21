/**
 * Утилиты для Realtime Collaboration
 */

/**
 * Генерирует детерминированный цвет на основе userId
 */
export function generateUserColor(userId: string): string {
  const colors = [
    "#3b82f6", // blue
    "#10b981", // green
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#f97316", // orange
    "#14b8a6", // teal
    "#a855f7", // purple
  ];

  // Простой хеш из userId
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

/**
 * Извлекает инициалы из displayName или email
 */
export function getInitials(displayName: string | undefined, email: string): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }

  // Из email берём первую букву до @
  const emailPart = email.split("@")[0];
  return emailPart.slice(0, 1).toUpperCase();
}

/**
 * Генерирует уникальный clientId для текущей вкладки
 */
export function generateClientId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback для старых браузеров
  return `client_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
