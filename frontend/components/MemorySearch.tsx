"use client";

import { useState } from "react";
import {
  Input,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
} from "@heroui/react";
import { IconSearch } from "@tabler/icons-react";

interface Memory {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
}

interface MemorySearchProps {
  memories: Memory[];
}

export default function MemorySearch({ memories }: MemorySearchProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMemories = memories.filter(
    (memory) =>
      memory.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      memory.tags.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  return (
    <>
      <Input
        type="text"
        value={searchQuery}
        onValueChange={setSearchQuery}
        placeholder="Search memories semantically..."
        size="lg"
        endContent={
          <IconSearch
            className="text-neutral-400 dark:text-neutral-600"
            size={20}
            stroke={1.5}
          />
        }
        classNames={{
          inputWrapper:
            "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
          input: "text-black dark:text-white",
        }}
      />

      <Table
        aria-label="Memories table"
        classNames={{
          wrapper:
            "border border-black/10 dark:border-white/10 rounded-xl shadow-none bg-transparent",
          th: "bg-black/[0.02] dark:bg-white/[0.02] text-neutral-500 font-medium",
          td: "py-5",
          tr: "hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer",
        }}
      >
        <TableHeader>
          <TableColumn>TITLE</TableColumn>
          <TableColumn className="hidden md:table-cell">TAGS</TableColumn>
          <TableColumn>CREATED</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No memories found">
          {filteredMemories.map((memory) => (
            <TableRow key={memory.id}>
              <TableCell>
                <span className="text-neutral-800 dark:text-neutral-200">
                  {memory.title}
                </span>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <div className="flex gap-2 flex-wrap">
                  {memory.tags.map((tag) => (
                    <Chip
                      key={tag}
                      size="sm"
                      variant="flat"
                      classNames={{
                        base: "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10",
                        content:
                          "text-neutral-600 dark:text-neutral-400 text-xs",
                      }}
                    >
                      {tag}
                    </Chip>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm text-neutral-500">
                  {memory.createdAt}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
