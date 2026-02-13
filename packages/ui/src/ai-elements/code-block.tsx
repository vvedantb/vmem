"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type HTMLAttributes,
} from "react";
import { IconCopy, IconCheck } from "@tabler/icons-react";
import { cn } from "../utils/cn";
import { Button } from "../ui/button";

interface CodeBlockContextValue {
  code: string;
}

const CodeBlockContext = createContext<CodeBlockContextValue | null>(null);

interface CodeBlockProps extends HTMLAttributes<HTMLDivElement> {
  code: string;
  language?: string;
}

function CodeBlock({
  code,
  language,
  children,
  className,
  ...props
}: CodeBlockProps) {
  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div
        className={cn("relative rounded-lg border bg-muted/50", className)}
        {...props}
      >
        {children ?? (
          <pre className="overflow-x-auto p-4">
            <code data-language={language} className="text-sm">
              {code}
            </code>
          </pre>
        )}
      </div>
    </CodeBlockContext.Provider>
  );
}

interface CodeBlockCopyButtonProps extends HTMLAttributes<HTMLButtonElement> {}

function CodeBlockCopyButton({
  className,
  ...props
}: CodeBlockCopyButtonProps) {
  const context = useContext(CodeBlockContext);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!context) return;
    navigator.clipboard.writeText(context.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [context]);

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className={cn("absolute top-2 right-2", className)}
      onClick={handleCopy}
      {...props}
    >
      {copied ? (
        <IconCheck className="size-3.5" stroke={1.5} />
      ) : (
        <IconCopy className="size-3.5" stroke={1.5} />
      )}
    </Button>
  );
}

export { CodeBlock, CodeBlockCopyButton, type CodeBlockProps };
