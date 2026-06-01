import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transform-gpu transition-transform duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:ring-offset-2 hover:scale-105 active:scale-95",
  {
    variants: {
      variant: {
        primary: "min-h-12 bg-emerald-500 text-white shadow-soft hover:shadow-glow-emerald active:shadow-inner disabled:cursor-not-allowed",
        secondary: "min-h-12 bg-gray-100 text-emerald-600 shadow-subtle hover:bg-gray-200 active:bg-gray-300 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-emerald-400 dark:hover:bg-gray-700",
        destructive: "min-h-12 bg-red-500 text-white shadow-subtle hover:bg-red-600 active:bg-red-700 disabled:cursor-not-allowed",
        ghost: "text-foreground hover:bg-gray-100 active:bg-gray-200 disabled:cursor-not-allowed dark:hover:bg-gray-800 dark:active:bg-gray-700",
        link: "text-emerald-600 underline-offset-4 hover:underline disabled:cursor-not-allowed dark:text-emerald-400",
        outline: "border border-gray-200 bg-transparent text-foreground hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed dark:border-gray-700 dark:hover:bg-gray-900 dark:active:bg-gray-800",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3 text-sm",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 text-xs",
        lg: "min-h-12 px-6 py-3 text-base",
        icon: "size-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

const buttonStyles = `
  @layer components {
    [data-slot="button"] {
      @apply hover:scale-102 active:scale-96 transition-transform duration-100 ease-out;
    }
    
    [data-slot="button"]:not(:disabled):hover {
      transform: scale(1.02);
    }
    
    [data-slot="button"]:not(:disabled):active {
      transform: scale(0.96);
    }
  }
`;

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
