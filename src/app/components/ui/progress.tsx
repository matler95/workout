"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "./utils";

type ProgressProps = React.ComponentProps<typeof ProgressPrimitive.Root> & {
  value?: number;
  showDot?: boolean;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
};

function Progress({
  className,
  value = 0,
  showDot = false,
  label,
  size = 'md',
  ...props
}: ProgressProps) {
  const heightClass = size === 'sm' ? 'h-2' : size === 'lg' ? 'h-3' : 'h-2';

  return (
    <div className={cn('relative w-full', className)}>
      {label && <div className="mb-2 text-sm text-muted-foreground">{label}</div>}

      <ProgressPrimitive.Root
        data-slot="progress"
        className={cn(
          `bg-muted/20 relative ${heightClass} w-full overflow-hidden rounded-full`,
        )}
        {...props}
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="bg-emerald-500 h-full w-full flex-1 transition-all duration-300 ease-out"
          style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
      </ProgressPrimitive.Root>

      {showDot && (
        <span
          data-slot="progress-dot"
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-cyan-500 shadow-glow-cyan"
          style={{ left: `${value}%` }}
        />
      )}
    </div>
  );
}

export { Progress };
