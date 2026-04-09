import { cn } from "@/lib/utils";

interface Avatar {
  name: string;
  id: string;
}

interface AvatarGroupProps {
  users: Avatar[];
  max?: number;
  size?: "sm" | "md";
}

export function AvatarGroup({ users, max = 3, size = "sm" }: AvatarGroupProps) {
  const shown = users.slice(0, max);
  const overflow = users.length - max;

  const sizeClass = size === "sm" ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm";

  return (
    <div className="flex -space-x-2">
      {shown.map((user) => (
        <div
          key={user.id}
          title={user.name}
          className={cn(
            "rounded-full bg-blue-100 flex items-center justify-center font-medium text-blue-700 border-2 border-white ring-0",
            sizeClass
          )}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className={cn(
            "rounded-full bg-gray-200 flex items-center justify-center font-medium text-gray-600 border-2 border-white",
            sizeClass
          )}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
