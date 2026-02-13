"use client";

import type { ComponentProps } from "react";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "./reasoning";

type ChainOfThoughtProps = ComponentProps<typeof Reasoning>;
type ChainOfThoughtTriggerProps = ComponentProps<typeof ReasoningTrigger>;
type ChainOfThoughtContentProps = ComponentProps<typeof ReasoningContent>;

function ChainOfThought(props: ChainOfThoughtProps) {
  return <Reasoning {...props} />;
}

function ChainOfThoughtTrigger(props: ChainOfThoughtTriggerProps) {
  return <ReasoningTrigger {...props} />;
}

function ChainOfThoughtContent(props: ChainOfThoughtContentProps) {
  return <ReasoningContent {...props} />;
}

export {
  ChainOfThought,
  ChainOfThoughtTrigger,
  ChainOfThoughtContent,
  type ChainOfThoughtProps,
  type ChainOfThoughtTriggerProps,
  type ChainOfThoughtContentProps,
};
