"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useActiveProfile } from "@/components/workspace/active-profile";
import type { Doc, Id } from "@vmem/backend";
import { cn } from "@vmem/ui";
import { SKILL_CHIP_CLASS } from "../_utils/mentionChipStyles";
import {
  computeMentionPopupPlacement,
  getSelectionAnchorRect,
  type MentionPopupPlacement,
} from "../_utils/mentionPopupPosition";
import {
  extractEditableText,
  normalizeEditorText,
  placeCursorAtEnd,
  renderSkillChipHtml,
} from "../_utils/skillMentionEditorUtils";
import { SkillChipHoverPortal } from "./SkillChipHoverPortal";
import { SkillSlashPickerPopup } from "./SkillSlashPickerPopup";

const EDITOR_CLASS =
  "relative block w-full min-h-16 max-h-40 flex-1 self-stretch overflow-y-auto scrollbar-thin whitespace-pre-wrap break-words bg-transparent px-3 py-3 text-left text-sm leading-normal outline-none focus-visible:outline-none data-[empty]:before:pointer-events-none data-[empty]:before:absolute data-[empty]:before:text-field-placeholder data-[empty]:before:content-[attr(data-placeholder)]";

interface SlashTrigger {
  isOpen: boolean;
  query: string;
  startIndex: number;
}

const CLOSED_TRIGGER: SlashTrigger = {
  isOpen: false,
  query: "",
  startIndex: 0,
};

function isSkillEnabled(skill: Doc<"skills">): boolean {
  return skill.enabled !== false;
}

function isValidSlashTrigger(value: string, slashIndex: number): boolean {
  const textAfter = value.slice(slashIndex + 1);
  if (textAfter.includes("\n") || /\s/.test(textAfter)) return false;
  const charBefore = slashIndex > 0 ? value[slashIndex - 1] : "";
  return (
    slashIndex === 0 || (charBefore !== undefined && /\s/.test(charBefore))
  );
}

function findSlashTrigger(
  value: string,
  hasSkills: boolean,
): SlashTrigger | null {
  if (!hasSkills) return null;
  const slashIndex = value.lastIndexOf("/");
  if (slashIndex === -1 || !isValidSlashTrigger(value, slashIndex)) return null;
  return {
    isOpen: true,
    query: value.slice(slashIndex + 1),
    startIndex: slashIndex,
  };
}

interface SkillMentionEditorProps {
  value: string;
  onValueChange: (value: string) => void;
  skills: Doc<"skills">[] | undefined;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onEnterSubmit?: (e: KeyboardEvent<HTMLDivElement>) => void;
}

export function SkillMentionEditor({
  value,
  onValueChange,
  skills,
  disabled = false,
  placeholder,
  className,
  onEnterSubmit,
}: SkillMentionEditorProps) {
  const navigate = useNavigate();
  const activeProfile = useActiveProfile();
  const editorRef = useRef<HTMLDivElement>(null);
  const [skillMap, setSkillMap] = useState<Map<string, Id<"skills">>>(
    () => new Map(),
  );
  const [trigger, setTrigger] = useState<SlashTrigger>(CLOSED_TRIGGER);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [popupPlacement, setPopupPlacement] =
    useState<MentionPopupPlacement | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [hoverSkillId, setHoverSkillId] = useState<Id<"skills"> | null>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const hoverChipRef = useRef<HTMLElement | null>(null);
  const hoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slashTriggerRef = useRef<SlashTrigger>(CLOSED_TRIGGER);

  const enabledSkills = useMemo(
    () => skills?.filter(isSkillEnabled) ?? [],
    [skills],
  );

  const skillById = useMemo(() => {
    const map = new Map<Id<"skills">, Doc<"skills">>();
    for (const skill of enabledSkills) {
      map.set(skill._id, skill);
    }
    return map;
  }, [enabledSkills]);

  const filteredSkills = useMemo(() => {
    if (!trigger.isOpen) return [];
    const query = trigger.query.toLowerCase();
    return enabledSkills
      .filter((skill) =>
        query.length === 0 ? true : skill.name.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [enabledSkills, trigger.isOpen, trigger.query]);

  const cancelHoverClose = useCallback(() => {
    if (hoverCloseTimerRef.current !== null) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }, []);

  const clearHover = useCallback(() => {
    cancelHoverClose();
    if (hoverOpenTimerRef.current !== null) {
      clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
    hoverChipRef.current = null;
    setHoverSkillId(null);
    setHoverRect(null);
  }, [cancelHoverClose]);

  const scheduleHoverClose = useCallback(() => {
    cancelHoverClose();
    hoverCloseTimerRef.current = setTimeout(() => {
      hoverCloseTimerRef.current = null;
      clearHover();
    }, 200);
  }, [cancelHoverClose, clearHover]);

  useEffect(() => {
    if (value === "" && skillMap.size > 0) {
      setSkillMap(new Map());
    }
  }, [value, skillMap.size]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (normalizeEditorText(extractEditableText(el)) !== value) {
      el.innerHTML = renderSkillChipHtml(
        value,
        skillMap,
        SKILL_CHIP_CLASS,
        true,
      );
      placeCursorAtEnd(el);
    }
  }, [value, skillMap]);

  useEffect(() => {
    const next = findSlashTrigger(value, enabledSkills.length > 0);
    if (!next) {
      if (slashTriggerRef.current.isOpen) {
        setTrigger(CLOSED_TRIGGER);
        slashTriggerRef.current = CLOSED_TRIGGER;
      }
      return;
    }

    const prev = slashTriggerRef.current;
    const shouldResetHighlight =
      !prev.isOpen ||
      prev.query !== next.query ||
      prev.startIndex !== next.startIndex;

    slashTriggerRef.current = next;
    setTrigger(next);
    if (shouldResetHighlight) {
      setSelectedIndex(0);
    }
  }, [value, enabledSkills.length]);

  useEffect(() => {
    setSelectedIndex((prev) => {
      if (filteredSkills.length === 0) return 0;
      return Math.min(prev, filteredSkills.length - 1);
    });
  }, [filteredSkills.length]);

  useEffect(() => {
    if (!trigger.isOpen) {
      setPopupPlacement(null);
      return;
    }
    const update = () => {
      requestAnimationFrame(() => {
        const el = editorRef.current;
        if (!el) return;
        setPopupPlacement(
          computeMentionPopupPlacement(getSelectionAnchorRect(el)),
        );
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [trigger.isOpen, trigger.query, trigger.startIndex, value, editorRef]);

  const closeTrigger = useCallback(() => {
    setTrigger((prev) => (prev.isOpen ? CLOSED_TRIGGER : prev));
    slashTriggerRef.current = CLOSED_TRIGGER;
    setSelectedIndex(0);
  }, []);

  const insertSkill = useCallback(
    (skill: Doc<"skills">) => {
      const visible = `/${skill.name}`;
      const before = value.slice(0, trigger.startIndex);
      const after = value.slice(trigger.startIndex + trigger.query.length + 1);
      const newValue = `${before}${visible} ${after}`;
      setSkillMap((prev) => {
        const next = new Map(prev);
        next.set(skill.name, skill._id);
        return next;
      });
      onValueChange(newValue);
      closeTrigger();
      requestAnimationFrame(() => editorRef.current?.focus());
    },
    [
      closeTrigger,
      editorRef,
      onValueChange,
      trigger.query.length,
      trigger.startIndex,
      value,
    ],
  );

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const text = normalizeEditorText(extractEditableText(el));
    if (text !== value) onValueChange(text);
  }, [editorRef, onValueChange, value]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (trigger.isOpen && filteredSkills.length > 0) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => {
            if (e.key === "ArrowDown") {
              return prev >= filteredSkills.length - 1 ? 0 : prev + 1;
            }
            return prev <= 0 ? filteredSkills.length - 1 : prev - 1;
          });
          return;
        }
        if (e.key === "Enter") {
          if (isComposing || e.nativeEvent.isComposing) return;
          e.preventDefault();
          e.stopPropagation();
          const skill = filteredSkills[selectedIndex];
          if (skill) insertSkill(skill);
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          const skill = filteredSkills[selectedIndex];
          if (skill) insertSkill(skill);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closeTrigger();
          return;
        }
      }

      if (e.key === "Enter" && onEnterSubmit) {
        if (isComposing || e.nativeEvent.isComposing) return;
        if (e.shiftKey) return;
        e.preventDefault();
        onEnterSubmit(e);
      }
    },
    [
      closeTrigger,
      filteredSkills,
      insertSkill,
      isComposing,
      onEnterSubmit,
      selectedIndex,
      trigger.isOpen,
    ],
  );

  const handleChipClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const chip = target.closest("[data-skill-label]");
      if (!(chip instanceof HTMLElement)) return;
      const label = chip.dataset.skillLabel;
      if (!label) return;
      const id = skillMap.get(label);
      if (id === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      void navigate({
        to: "/$profileId/skills/$id",
        params: { profileId: activeProfile._id, id },
      });
    },
    [navigate, skillMap, activeProfile._id],
  );

  const scheduleHover = useCallback(
    (chip: HTMLElement) => {
      cancelHoverClose();
      if (hoverChipRef.current === chip) return;
      hoverChipRef.current = chip;
      if (hoverOpenTimerRef.current !== null) {
        clearTimeout(hoverOpenTimerRef.current);
      }
      const label = chip.dataset.skillLabel;
      if (!label) return;
      const id = skillMap.get(label);
      if (id === undefined) return;
      hoverOpenTimerRef.current = setTimeout(() => {
        hoverOpenTimerRef.current = null;
        setHoverSkillId(id);
        setHoverRect(chip.getBoundingClientRect());
      }, 250);
    },
    [cancelHoverClose, skillMap],
  );

  const handleMouseOver = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const chip = target.closest("[data-skill-label]");
      if (chip instanceof HTMLElement) scheduleHover(chip);
    },
    [scheduleHover],
  );

  const handleMouseOut = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const related = e.relatedTarget;
      if (
        related instanceof Element &&
        (related.closest("[data-skill-label]") !== null ||
          related.closest("[data-skill-hover-card]") !== null)
      ) {
        return;
      }
      scheduleHoverClose();
    },
    [scheduleHoverClose],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      handleInput();
    },
    [handleInput],
  );

  const isEmpty = value === "" || value === "\n";
  const hoverSkill =
    hoverSkillId !== null ? (skillById.get(hoverSkillId) ?? null) : null;

  return (
    <>
      <div
        ref={editorRef}
        data-slot="input-group-control"
        data-placeholder={placeholder ?? ""}
        data-empty={isEmpty ? "true" : undefined}
        contentEditable={disabled ? false : true}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder ?? "Message input"}
        className={cn(EDITOR_CLASS, className)}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={handleChipClick}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
        onBlur={closeTrigger}
        onPaste={handlePaste}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
      />
      {trigger.isOpen && popupPlacement && typeof document !== "undefined"
        ? createPortal(
            <SkillSlashPickerPopup
              placement={popupPlacement}
              skills={skills}
              filteredSkills={filteredSkills}
              highlightIndex={selectedIndex}
              onSelect={insertSkill}
            />,
            document.body,
          )
        : null}
      {hoverSkill && hoverRect ? (
        <SkillChipHoverPortal
          skill={hoverSkill}
          anchorRect={hoverRect}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
        />
      ) : null}
    </>
  );
}
