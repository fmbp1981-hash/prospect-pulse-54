import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Badge — Precision Dark design system
 * Conforme MASTER-ARCHITECTURE.md: rounded 4px, font-mono, border 1px, sem rounded-full
 * Tokens: primary/destructive/muted/success(green)/warning(amber)/info(blue) — todos via Tailwind padrão
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded border font-mono text-[10px] font-medium tracking-wide px-1.5 py-px transition-colors focus:outline-none focus:ring-1 focus:ring-ring",
  {
    variants: {
      variant: {
        default:     "bg-primary/10 border-primary/30 text-primary",
        secondary:   "bg-secondary border-border text-muted-foreground",
        destructive: "bg-destructive/10 border-destructive/30 text-destructive",
        outline:     "border-border text-foreground",
        success:     "bg-green-950/60 border-green-500/30 text-green-400",
        warning:     "bg-amber-950/60 border-amber-500/30 text-amber-400",
        info:        "bg-blue-950/60 border-blue-500/30 text-blue-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
