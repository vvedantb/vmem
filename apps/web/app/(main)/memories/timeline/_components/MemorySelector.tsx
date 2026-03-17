"use client";

import { useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Badge,
  cn,
} from "@vmem/ui";
import { IconCheck, IconSelector } from "@tabler/icons-react";
import { useMemoryContext } from "@/components/contexts/MemoryContext";

interface MemorySelectorProps {
  value: string;
  onSelect: (memoryId: string) => void;
}

export default function MemorySelector({
  value,
  onSelect,
}: MemorySelectorProps) {
  const { memories } = useMemoryContext();
  const [open, setOpen] = useState(false);

  const selectedMemory = value
    ? memories.find((m) => m.id === value)
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full max-w-md justify-between"
        >
          <span className="truncate">
            {selectedMemory ? selectedMemory.title : "Select a memory..."}
          </span>
          <IconSelector className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search memories..." />
          <CommandList>
            <CommandEmpty>No memories found.</CommandEmpty>
            <CommandGroup>
              {memories.map((memory) => (
                <CommandItem
                  key={memory.id}
                  value={memory.title}
                  onSelect={() => {
                    onSelect(memory.id);
                    setOpen(false);
                  }}
                >
                  <IconCheck
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === memory.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate flex-1">{memory.title}</span>
                  {memory.tags.length > 0 && (
                    <Badge variant="outline" className="ml-2 text-xs shrink-0">
                      {memory.tags[0]}
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
