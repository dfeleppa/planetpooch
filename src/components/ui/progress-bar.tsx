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
      <div
        className={cn("flex-1 rounded-full bg-pp-accent-soft overflow-hidden", heights[size])}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={Math.max(max, 1)}
        aria-valuetext={`${percentage}% complete`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            percentage === 100 ? "bg-pp-mint" : percentage > 0 ? "bg-pp-accent" : "bg-pp-accent-soft"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-sm font-medium text-pp-ink-3 min-w-[3rem] text-right">
          {percentage}%
        </span>
      )}
    </div>
  );
}
