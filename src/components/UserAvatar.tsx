import type { PresencePayload } from "@/lib/types";
import { getInitials } from "@/lib/realtimeUtils";

interface UserAvatarProps {
  user: PresencePayload;
  size?: "small" | "medium";
}

export function UserAvatar({ user, size = "medium" }: UserAvatarProps) {
  const sizeStyles = size === "small" 
    ? { width: 24, height: 24, fontSize: 10 }
    : { width: 32, height: 32, fontSize: 12 };

  const initials = getInitials(user.displayName, user.email);
  const displayText = user.displayName || user.email;

  return (
    <div
      title={displayText}
      style={{
        ...sizeStyles,
        borderRadius: "50%",
        backgroundColor: user.color,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        flexShrink: 0,
        cursor: "default",
        userSelect: "none",
      }}
    >
      {initials}
    </div>
  );
}

interface UserAvatarGroupProps {
  users: PresencePayload[];
  maxVisible?: number;
  size?: "small" | "medium";
}

export function UserAvatarGroup({ users, maxVisible = 5, size = "medium" }: UserAvatarGroupProps) {
  const visible = users.slice(0, maxVisible);
  const remaining = users.length - maxVisible;

  const sizeStyles = size === "small" 
    ? { width: 24, height: 24, fontSize: 10 }
    : { width: 32, height: 32, fontSize: 12 };

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {visible.map((user) => (
        <UserAvatar key={user.userId} user={user} size={size} />
      ))}
      {remaining > 0 && (
        <div
          style={{
            ...sizeStyles,
            borderRadius: "50%",
            backgroundColor: "#e2e8f0",
            color: "#475569",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            flexShrink: 0,
          }}
          title={`Ещё ${remaining} ${remaining === 1 ? "пользователь" : "пользователей"}`}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
