import { useLayoutEffect, useState, type RefObject } from "react";
import { getTextareaCaretCoordinates } from "./textareaCaretCoordinates";

export interface CaretPoint {
  top: number;
  left: number;
}

export function useSlashMenuCaretPoint(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  menuOpen: boolean,
  caretIndex: number | null,
): CaretPoint {
  const [point, setPoint] = useState<CaretPoint>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!menuOpen || !textarea || caretIndex === null) return;

    const update = () => {
      setPoint(getTextareaCaretCoordinates(textarea, caretIndex));
    };

    update();
    textarea.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      textarea.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [caretIndex, menuOpen, textareaRef]);

  return point;
}
