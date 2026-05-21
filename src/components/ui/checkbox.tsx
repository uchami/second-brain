"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded border border-neutral-400 bg-white outline-none transition-colors data-[state=checked]:border-neutral-900 data-[state=checked]:bg-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:data-[state=checked]:border-neutral-200 dark:data-[state=checked]:bg-neutral-200",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-white dark:text-neutral-900">
        <Check size={14} strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
