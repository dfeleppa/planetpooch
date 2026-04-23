import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export function ProgressBar({ value, max = 100, className, showLabel = true, size = "md" }: ProgressBarProps) {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;
  const heights = { sm: "h-1.5", md: "h-2.5", lg: "h-4" };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn("flex-1 rounded-full bg-gray-200 overflow-hidden", heights[size])}>
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            percentage === 100 ? "bg-green-500" : percentage > 0 ? "bg-blue-500" : "bg-gray-200"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-sm font-medium text-gray-600 min-w-[3rem] text-right">
          {percentage}%
        </span>
      )}
    </div>
  );
}
