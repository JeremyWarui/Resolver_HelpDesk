import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, last conflicting utility winning.
 *
 *  Lives here because `@/lib/utils` is the path shadcn components import,
 *  and every caller in this app followed them. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
