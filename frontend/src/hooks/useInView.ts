import { useEffect, useRef, useState } from "react";

// Start mounting this far before the element reaches the viewport, so the
// content is ready by the time it is scrolled to.
const ROOT_MARGIN = "300px";

// "Freeze once visible" — once the element has intersected, keeps returning
// true even after it scrolls back out, so callers can mount-once-and-keep.
export function useInView<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    if (isInView) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: ROOT_MARGIN }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isInView]);

  return { ref, isInView };
}
