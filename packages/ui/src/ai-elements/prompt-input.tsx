"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ComponentProps,
  type HTMLAttributes,
} from "react";
import type { ChatStatus } from "ai";
import { IconArrowUp, IconSquare } from "@tabler/icons-react";
import { cn } from "../utils/cn";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "../ui/input-group";
import { Button, type ButtonProps } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

interface PromptInputContextValue {
  input: string;
  setInput: (value: string) => void;
  status: ChatStatus;
  textareaRef: React.RefObject<HTMLElement | null>;
}

const PromptInputContext = createContext<PromptInputContextValue | null>(null);

function usePromptInput() {
  const ctx = useContext(PromptInputContext);
  if (!ctx) throw new Error("usePromptInput must be used within <PromptInput>");
  return ctx;
}

interface PromptInputMessage {
  text: string;
}

interface PromptInputProps extends Omit<
  HTMLAttributes<HTMLFormElement>,
  "onSubmit"
> {
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent,
  ) => void | Promise<void>;
  input?: string;
  onInputChange?: (value: string) => void;
  status?: ChatStatus;
}

function PromptInput({
  onSubmit,
  input: controlledInput,
  onInputChange,
  status = "ready",
  children,
  className,
  ...props
}: PromptInputProps) {
  const [uncontrolledInput, setUncontrolledInput] = useState("");
  const textareaRef = useRef<HTMLElement>(null);

  const input = controlledInput ?? uncontrolledInput;
  const setInput = useCallback(
    (value: string) => {
      if (onInputChange) onInputChange(value);
      else setUncontrolledInput(value);
    },
    [onInputChange],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || status !== "ready") return;
      await onSubmit({ text }, e);
      setInput("");
      textareaRef.current?.focus();
    },
    [input, status, onSubmit, setInput],
  );

  return (
    <PromptInputContext.Provider
      value={{ input, setInput, status, textareaRef }}
    >
      <form
        onSubmit={handleSubmit}
        className={cn("flex flex-col", className)}
        {...props}
      >
        <InputGroup className="flex-col">{children}</InputGroup>
      </form>
    </PromptInputContext.Provider>
  );
}

type PromptInputTextareaProps = Omit<
  ComponentProps<typeof InputGroupTextarea>,
  "value" | "onChange"
>;

function PromptInputTextarea({
  className,
  ...props
}: PromptInputTextareaProps) {
  const { input, setInput, status, textareaRef } = usePromptInput();

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = (e.target as HTMLElement).closest("form");
      if (form) form.requestSubmit();
    }
  }, []);

  return (
    <InputGroupTextarea
      ref={textareaRef}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={handleKeyDown}
      disabled={status === "streaming" || status === "submitted"}
      rows={1}
      className={cn("min-h-11 px-3 py-3", className)}
      {...props}
    />
  );
}

interface PromptInputHeaderProps extends HTMLAttributes<HTMLDivElement> {}

function PromptInputHeader({ className, ...props }: PromptInputHeaderProps) {
  return (
    <InputGroupAddon align="block-start" className={className} {...props} />
  );
}

interface PromptInputFooterProps extends HTMLAttributes<HTMLDivElement> {}

function PromptInputFooter({ className, ...props }: PromptInputFooterProps) {
  return (
    <InputGroupAddon
      align="block-end"
      className={cn("justify-end", className)}
      {...props}
    />
  );
}

interface PromptInputToolsProps extends HTMLAttributes<HTMLDivElement> {}

function PromptInputTools({ className, ...props }: PromptInputToolsProps) {
  return (
    <div className={cn("flex items-center gap-1", className)} {...props} />
  );
}

interface PromptInputButtonProps extends ButtonProps {
  tooltip?: string;
}

function PromptInputButton({
  tooltip,
  children,
  className,
  ...props
}: PromptInputButtonProps) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={className}
      {...props}
    >
      {children}
    </Button>
  );

  if (!tooltip) return button;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface PromptInputSubmitProps extends ButtonProps {
  onStop?: () => void;
}

function PromptInputSubmit({
  onStop,
  className,
  ...props
}: PromptInputSubmitProps) {
  const { input, status } = usePromptInput();
  const isRunning = status === "streaming" || status === "submitted";

  if (isRunning) {
    return (
      <Button
        type="button"
        variant="destructive"
        size="icon-xs"
        className={className}
        onClick={onStop}
        {...props}
      >
        <IconSquare className="size-3.5" stroke={1.5} />
      </Button>
    );
  }

  return (
    <Button
      type="submit"
      variant="default"
      size="icon-xs"
      disabled={!input.trim()}
      className={className}
      {...props}
    >
      <IconArrowUp className="size-3.5" stroke={1.5} />
    </Button>
  );
}

export {
  PromptInput,
  PromptInputTextarea,
  PromptInputHeader,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
  usePromptInput,
  type PromptInputProps,
  type PromptInputMessage,
  type PromptInputTextareaProps,
  type PromptInputHeaderProps,
  type PromptInputFooterProps,
  type PromptInputToolsProps,
  type PromptInputButtonProps,
  type PromptInputSubmitProps,
};
