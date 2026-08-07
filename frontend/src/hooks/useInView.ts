import { useEffect, useRef, useState } from "react";

interface UseInViewOptions {
  rootMargin?: string;
}

// "Freeze once visible" — once the element has intersected, keeps returning
// true even after it scrolls back out, so callers can mount-once-and-keep.
export function useInView<T extends Element>({ rootMargin = "300px" }: UseInViewOptions = {}) {
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
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isInView, rootMargin]);

  return { ref, isInView };
}
