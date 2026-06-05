"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc } from "@vmem/backend";
import { usePromptInput } from "@vmem/ui/ai";
import {
  cn,
  InputGroupTextarea,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@vmem/ui";
import {
  applySlashSkillSelection,
  parseTrailingSlashSkillQuery,
} from "../_utils/slashSkill";
import { useSlashMenuCaretPoint } from "../_utils/useSlashMenuCaretPoint";
import {
  ChatInputSkillHighlight,
  CHAT_SKILL_INPUT_LAYOUT_CLASS,
} from "./ChatInputSkillHighlight";
import { ChatSkillSlashMenu } from "./ChatSkillSlashMenu";

type PromptTextareaProps = Omit<
  ComponentProps<typeof InputGroupTextarea>,
  "value" | "onChange" | "onKeyDown"
>;

function isSkillEnabled(skill: Doc<"skills">): boolean {
  return skill.enabled !== false;
}

export function ChatPromptTextarea({
  className,
  disabled,
  ...props
}: PromptTextareaProps) {
  const { input, setInput, status, textareaRef } = usePromptInput();
  const skills = useQuery(api.skills.listMy);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const slash = parseTrailingSlashSkillQuery(input);
  const menuOpen = slash !== null && status === "ready";

  const slashCaretIndex = slash
    ? slash.replaceStart + 1 + slash.query.length
    : null;

  const caretPoint = useSlashMenuCaretPoint(
    textareaRef,
    menuOpen,
    slashCaretIndex,
  );

  const enabledSkillNames = useMemo(() => {
    if (!skills) return new Set<string>();
    return new Set(skills.filter(isSkillEnabled).map((skill) => skill.name));
  }, [skills]);

  const filteredSkills = useMemo(() => {
    if (!skills || !slash) return [];
    const query = slash.query.toLowerCase();
    return skills
      .filter(isSkillEnabled)
      .filter((skill) =>
        query.length === 0 ? true : skill.name.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [skills, slash]);

  const safeHighlight =
    filteredSkills.length === 0
      ? 0
      : Math.min(highlightIndex, filteredSkills.length - 1);

  useEffect(() => {
    setHighlightIndex(0);
  }, [slash?.query]);

  const selectSkill = useCallback(
    (skill: Doc<"skills">) => {
      if (!slash) return;
      setInput(applySlashSkillSelection(input, slash.replaceStart, skill.name));
      setHighlightIndex(0);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [input, setInput, slash, textareaRef],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!menuOpen || filteredSkills.length === 0) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const form = e.currentTarget.closest("form");
          if (form) form.requestSubmit();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % filteredSkills.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex(
          (i) => (i - 1 + filteredSkills.length) % filteredSkills.length,
        );
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const skill = filteredSkills[safeHighlight];
        if (skill) selectSkill(skill);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (slash) {
          setInput(input.slice(0, slash.replaceStart));
        }
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const skill = filteredSkills[safeHighlight];
        if (skill) selectSkill(skill);
      }
    },
    [
      filteredSkills,
      input,
      menuOpen,
      safeHighlight,
      selectSkill,
      setInput,
      slash,
    ],
  );

  const inputDisabled = status === "streaming" || status === "submitted";

  return (
    <Popover open={menuOpen} modal={false}>
      <div className="relative w-full flex-1 min-w-0">
        <ChatInputSkillHighlight input={input} skillNames={enabledSkillNames} />
        <InputGroupTextarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          className={cn(
            CHAT_SKILL_INPUT_LAYOUT_CLASS,
            "relative z-[1] border-0 bg-transparent text-transparent caret-foreground shadow-none selection:bg-surface-tertiary/50 focus-visible:border-0 focus-visible:ring-0",
            className,
          )}
          {...props}
          disabled={inputDisabled || disabled}
        />
        {menuOpen ? (
          <PopoverAnchor asChild>
            <span
              aria-hidden
              className="pointer-events-none absolute z-10 h-px w-px"
              style={{ top: caretPoint.top, left: caretPoint.left }}
            />
          </PopoverAnchor>
        ) : null}
      </div>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="w-56 max-w-[calc(100vw-2rem)] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <ChatSkillSlashMenu
          skills={skills}
          filteredSkills={filteredSkills}
          highlightIndex={highlightIndex}
          onSelect={selectSkill}
        />
      </PopoverContent>
    </Popover>
  );
}
