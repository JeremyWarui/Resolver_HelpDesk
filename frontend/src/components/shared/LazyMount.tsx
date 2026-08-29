import type { ReactNode } from "react";
import { useInView } from "@/hooks/useInView";
import { Skeleton } from "@/components/ui/skeleton";

interface LazyMountProps {
  children: ReactNode;
  /** Placeholder height in px — should roughly match the mounted content to avoid layout shift. */
  minHeight?: number;
}

// Defers mounting children (and their forced-reflow-triggering chart measurements)
// until the wrapper scrolls near the viewport, instead of mounting everything in
// one synchronous commit on page load.
const LazyMount = ({ children, minHeight = 320 }: LazyMountProps) => {
  const { ref, isInView } = useInView<HTMLDivElement>();

  if (isInView) {
    return <div className="mb-2">{children}</div>;
  }

  return (
    <div ref={ref} className="mb-2">
      <Skeleton style={{ height: minHeight }} className="w-full" />
    </div>
  );
};

export default LazyMount;
