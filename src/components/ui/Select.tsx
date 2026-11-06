"use client";

import { cn } from "@/lib/utils";
import { SelectHTMLAttributes, forwardRef, useId } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, children, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const describedBy = [props["aria-describedby"], error ? errorId : undefined].filter(Boolean).join(" ") || undefined;
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={cn(
            "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50",
            error && "border-red-500 focus:ring-red-500",
            className
          )}
          {...props}
          aria-invalid={error ? true : props["aria-invalid"]}
          aria-describedby={describedBy}
        >
          {children}
        </select>
        {error && <p id={errorId} role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
Select.displayName = "Select";
