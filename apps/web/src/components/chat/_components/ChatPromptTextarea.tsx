"use client";

import { useCallback, type ComponentProps, type KeyboardEvent } from "react";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { usePromptInput } from "@vmem/ui/ai";
import { cn, InputGroupTextarea } from "@vmem/ui";
import { SkillMentionEditor } from "./SkillMentionEditor";

type PromptTextareaProps = Omit<
  ComponentProps<typeof InputGroupTextarea>,
  "value" | "onChange" | "onKeyDown"
>;

export function ChatPromptTextarea({
  className,
  disabled,
  placeholder,
}: PromptTextareaProps) {
  const { input, setInput, status } = usePromptInput();
  const skills = useQuery(api.skills.listMy, {});

  const inputDisabled = status === "streaming" || status === "submitted";

  const handleEnterSubmit = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const form = e.currentTarget.closest("form");
    if (!(form instanceof HTMLFormElement)) return;
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton instanceof HTMLButtonElement && submitButton.disabled) {
      return;
    }
    form.requestSubmit();
  }, []);

  return (
    <SkillMentionEditor
      value={input}
      onValueChange={setInput}
      skills={skills}
      disabled={inputDisabled || disabled}
      placeholder={placeholder}
      onEnterSubmit={handleEnterSubmit}
      className={cn(
        "w-full flex-1 border-0 shadow-none focus-visible:ring-0",
        className,
      )}
    />
  );
}
