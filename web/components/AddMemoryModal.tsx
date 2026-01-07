"use client";

import { useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Button,
  Input,
  Textarea,
  Chip,
  useDisclosure,
} from "@heroui/react";
import { IconPlus } from "@tabler/icons-react";

export default function AddMemoryModal() {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim().toLowerCase())) {
        setTags([...tags, tagInput.trim().toLowerCase()]);
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log({ title, content, tags });
    onOpenChange();
  };

  const resetForm = () => {
    setTitle("");
    setContent("");
    setTagInput("");
    setTags([]);
  };

  return (
    <>
      <Button
        onPress={onOpen}
        className="bg-black dark:bg-white text-white dark:text-black font-medium"
        startContent={<IconPlus size={18} />}
      >
        Add Memory
      </Button>

      <Modal
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
          onOpenChange();
        }}
        size="2xl"
        classNames={{
          base: "bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10",
          header: "border-b border-black/10 dark:border-white/10",
          body: "py-6",
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <span className="text-xl font-semibold text-black dark:text-white">
                  Add Memory
                </span>
                <span className="text-sm font-normal text-neutral-500">
                  Store a new memory in your vault
                </span>
              </ModalHeader>
              <ModalBody>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
                      Title
                    </label>
                    <Input
                      type="text"
                      value={title}
                      onValueChange={setTitle}
                      placeholder="Enter a title for your memory"
                      size="lg"
                      classNames={{
                        inputWrapper:
                          "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
                        input: "text-black dark:text-white",
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
                      Content
                    </label>
                    <Textarea
                      value={content}
                      onValueChange={setContent}
                      placeholder="Write your memory content here..."
                      minRows={6}
                      classNames={{
                        inputWrapper:
                          "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
                        input: "text-black dark:text-white",
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
                      Tags
                    </label>
                    <Input
                      type="text"
                      value={tagInput}
                      onValueChange={setTagInput}
                      onKeyDown={handleAddTag}
                      placeholder="Type a tag and press Enter"
                      size="lg"
                      classNames={{
                        inputWrapper:
                          "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
                        input: "text-black dark:text-white",
                      }}
                    />
                    {tags.length > 0 && (
                      <div className="flex gap-2 flex-wrap mt-3">
                        {tags.map((tag) => (
                          <Chip
                            key={tag}
                            variant="flat"
                            onClose={() => removeTag(tag)}
                            classNames={{
                              base: "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10",
                              content: "text-neutral-700 dark:text-neutral-300",
                              closeButton:
                                "text-neutral-500 hover:text-black dark:hover:text-white",
                            }}
                          >
                            {tag}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button
                      variant="flat"
                      onPress={onClose}
                      className="bg-black/5 dark:bg-white/5 text-neutral-700 dark:text-neutral-300"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="bg-black dark:bg-white text-white dark:text-black font-medium"
                    >
                      Save Memory
                    </Button>
                  </div>
                </form>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
