"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-100",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[80px] w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-100",
        className,
      )}
      {...props}
    />
  );
});

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "text-xs font-medium text-neutral-600 dark:text-neutral-400",
        className,
      )}
      {...props}
    />
  );
}
