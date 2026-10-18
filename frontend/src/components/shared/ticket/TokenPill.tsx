import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The rounded pill every ticket badge is drawn as.
 *
 * Colour comes from a CSS variable triplet — `<base>-bg`, `-text`, `-border`,
 * all defined in index.css, so a badge names a token, not a palette.
 */
export function TokenPill({
  token,
  children,
  className,
  title,
}: {
  /** CSS variable base, e.g. `--status-open`. */
  token: string;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        className,
      )}
      style={{
        backgroundColor: `var(${token}-bg)`,
        color: `var(${token}-text)`,
        borderColor: `var(${token}-border)`,
      }}
      title={title}
    >
      {children}
    </span>
  );
}
