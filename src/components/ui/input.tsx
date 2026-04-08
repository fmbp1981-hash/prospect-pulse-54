import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Input — Precision Dark design system
 * Conforme MASTER-ARCHITECTURE.md: rounded 4px, border border-input, bg-secondary, text-sm font-ui
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-8 w-full rounded border border-input bg-secondary px-3 py-1.5",
          "text-sm text-foreground placeholder:text-muted-foreground",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring",
          "disabled:cursor-not-allowed disabled:opacity-40",
          "transition-colors",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
