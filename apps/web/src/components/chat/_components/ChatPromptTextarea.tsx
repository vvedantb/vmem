"use client";

import { useCallback, type ComponentProps } from "react";
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
  const { input, setInput, status, textareaRef } = usePromptInput();
  const skills = useQuery(api.skills.listMy);

  const inputDisabled = status === "streaming" || status === "submitted";

  const handleEnterSubmit = useCallback(() => {
    const editor = textareaRef.current;
    const form = editor?.closest("form");
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
    }
  }, [textareaRef]);

  return (
    <SkillMentionEditor
      value={input}
      onValueChange={setInput}
      skills={skills}
      disabled={inputDisabled || disabled}
      placeholder={placeholder}
      editorRef={textareaRef}
      onEnterSubmit={handleEnterSubmit}
      className={cn("border-0 shadow-none focus-visible:ring-0", className)}
    />
  );
}
