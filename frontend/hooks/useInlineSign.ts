import { useDirection } from "@radix-ui/react-direction";

/**
 * +1 in left-to-right languages, -1 in right-to-left ones (Arabic). Multiply
 * a horizontal motion offset (framer-motion `x`) by it so a slide-in comes
 * from the inline end and leaves towards the inline start in both directions,
 * the way logical Tailwind classes (ms-/start-) mirror layout. Reads the
 * direction from providers/directionProvider.tsx.
 */
export function useInlineSign(): 1 | -1 {
  return useDirection() === "rtl" ? -1 : 1;
}
