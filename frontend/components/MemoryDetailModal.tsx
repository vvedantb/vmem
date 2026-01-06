"use client";

import { useState, useCallback } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
  Chip,
  addToast,
} from "@heroui/react";
import {
  IconEdit,
  IconTrash,
  IconX,
  IconCheck,
  IconLoader2,
} from "@tabler/icons-react";

interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

interface MemoryDetailModalProps {
  isOpen: boolean;
  memory: Memory | null;
  onClose: () => void;
  onMemoryUpdate: (memory: Memory) => void;
  onMemoryDelete: (id: string) => void;
  relatedMemories: Memory[];
  onSelectRelated: (memory: Memory) => void;
}

export default function MemoryDetailModal({
  isOpen,
  memory,
  onClose,
  onMemoryUpdate,
  onMemoryDelete,
  relatedMemories,
  onSelectRelated,
}: MemoryDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const startEditing = useCallback(() => {
    if (memory) {
      setEditTitle(memory.title);
      setEditContent(memory.content);
      setEditTags([...memory.tags]);
      setIsEditing(true);
    }
  }, [memory]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditTitle("");
    setEditContent("");
    setEditTags([]);
    setNewTag("");
  }, []);

  const handleSave = useCallback(async () => {
    if (!memory) return;

    if (!editTitle.trim()) {
      addToast({
        title: "Validation Error",
        description: "Title cannot be empty",
        color: "danger",
      });
      return;
    }

    if (!editContent.trim()) {
      addToast({
        title: "Validation Error",
        description: "Content cannot be empty",
        color: "danger",
      });
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/memories/${memory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          content: editContent.trim(),
          tags: editTags,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update memory");
      }

      onMemoryUpdate(data.data);
      setIsEditing(false);
      addToast({
        title: "Success",
        description: "Memory updated successfully",
        color: "success",
      });
    } catch (err) {
      addToast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update memory",
        color: "danger",
      });
    } finally {
      setIsSaving(false);
    }
  }, [memory, editTitle, editContent, editTags, onMemoryUpdate]);

  const handleDelete = useCallback(async () => {
    if (!memory) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/memories/${memory.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete memory");
      }

      onMemoryDelete(memory.id);
      setShowDeleteConfirm(false);
      onClose();
      addToast({
        title: "Success",
        description: "Memory deleted successfully",
        color: "success",
      });
    } catch (err) {
      addToast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to delete memory",
        color: "danger",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [memory, onMemoryDelete, onClose]);

  const addTag = useCallback(() => {
    const tag = newTag.trim().toLowerCase();
    if (tag && !editTags.includes(tag)) {
      setEditTags([...editTags, tag]);
      setNewTag("");
    }
  }, [newTag, editTags]);

  const removeTag = useCallback((tagToRemove: string) => {
    setEditTags(editTags.filter((tag) => tag !== tagToRemove));
  }, [editTags]);

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTag();
      }
    },
    [addTag]
  );

  const handleClose = useCallback(() => {
    setIsEditing(false);
    setShowDeleteConfirm(false);
    setEditTitle("");
    setEditContent("");
    setEditTags([]);
    setNewTag("");
    onClose();
  }, [onClose]);

  if (!memory) return null;

  return (
    <>
      {/* Main detail modal */}
      <Modal
        isOpen={isOpen && !showDeleteConfirm}
        onClose={handleClose}
        size="2xl"
        scrollBehavior="inside"
        classNames={{
          base: "bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10",
          header: "border-b border-black/10 dark:border-white/10",
          body: "py-6",
          footer: "border-t border-black/10 dark:border-white/10",
        }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center justify-between gap-4">
            {isEditing ? (
              <Input
                value={editTitle}
                onValueChange={setEditTitle}
                placeholder="Memory title"
                size="lg"
                isDisabled={isSaving}
                classNames={{
                  inputWrapper:
                    "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
                  input: "text-black dark:text-white text-lg font-semibold",
                }}
              />
            ) : (
              <span className="text-neutral-800 dark:text-neutral-200 text-lg font-semibold">
                {memory.title}
              </span>
            )}
            <Button
              size="sm"
              variant="light"
              isIconOnly
              onPress={handleClose}
              className="text-neutral-500 flex-shrink-0"
            >
              <IconX size={18} />
            </Button>
          </ModalHeader>

          <ModalBody>
            <div className="space-y-6">
              {/* Content */}
              <div>
                <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                  Content
                </h4>
                {isEditing ? (
                  <Textarea
                    value={editContent}
                    onValueChange={setEditContent}
                    placeholder="Memory content"
                    minRows={4}
                    maxRows={10}
                    isDisabled={isSaving}
                    classNames={{
                      inputWrapper:
                        "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
                      input: "text-black dark:text-white",
                    }}
                  />
                ) : (
                  <p className="text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
                    {memory.content}
                  </p>
                )}
              </div>

              {/* Tags */}
              <div>
                <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                  Tags
                </h4>
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      {editTags.map((tag) => (
                        <Chip
                          key={tag}
                          size="sm"
                          variant="flat"
                          onClose={() => removeTag(tag)}
                          classNames={{
                            base: "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10",
                            content: "text-neutral-600 dark:text-neutral-400 text-xs",
                            closeButton: "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300",
                          }}
                        >
                          {tag}
                        </Chip>
                      ))}
                    </div>
                    <Input
                      value={newTag}
                      onValueChange={setNewTag}
                      onKeyDown={handleTagKeyDown}
                      placeholder="Add a tag and press Enter"
                      size="sm"
                      isDisabled={isSaving}
                      classNames={{
                        inputWrapper:
                          "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
                        input: "text-black dark:text-white",
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {memory.tags.length > 0 ? (
                      memory.tags.map((tag) => (
                        <Chip
                          key={tag}
                          size="sm"
                          variant="flat"
                          classNames={{
                            base: "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10",
                            content: "text-neutral-600 dark:text-neutral-400 text-xs",
                          }}
                        >
                          {tag}
                        </Chip>
                      ))
                    ) : (
                      <span className="text-sm text-neutral-400 dark:text-neutral-500">
                        No tags
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Created date */}
              <div>
                <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                  Created
                </h4>
                <p className="text-neutral-600 dark:text-neutral-400">
                  {formatDate(memory.createdAt)}
                </p>
              </div>

              {/* Related memories */}
              {!isEditing && (
                <div>
                  <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                    Related Memories
                  </h4>
                  {relatedMemories.length > 0 ? (
                    <div className="space-y-2">
                      {relatedMemories.map((related) => {
                        const sharedTags = related.tags.filter((tag) =>
                          memory.tags.includes(tag)
                        );
                        return (
                          <button
                            key={related.id}
                            onClick={() => onSelectRelated(related)}
                            className="w-full text-left p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                          >
                            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                              {related.title}
                            </p>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                              {sharedTags.length} shared tag
                              {sharedTags.length !== 1 ? "s" : ""}: {sharedTags.join(", ")}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      No related memories found
                    </p>
                  )}
                </div>
              )}
            </div>
          </ModalBody>

          <ModalFooter className="flex justify-between">
            {isEditing ? (
              <>
                <Button
                  variant="light"
                  onPress={cancelEditing}
                  isDisabled={isSaving}
                  className="text-neutral-600 dark:text-neutral-400"
                >
                  Cancel
                </Button>
                <Button
                  onPress={handleSave}
                  isDisabled={isSaving}
                  className="bg-black dark:bg-white text-white dark:text-black"
                  startContent={
                    isSaving ? (
                      <IconLoader2 size={16} className="animate-spin" />
                    ) : (
                      <IconCheck size={16} />
                    )
                  }
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="light"
                  color="danger"
                  onPress={() => setShowDeleteConfirm(true)}
                  startContent={<IconTrash size={16} />}
                >
                  Delete
                </Button>
                <Button
                  onPress={startEditing}
                  className="bg-black dark:bg-white text-white dark:text-black"
                  startContent={<IconEdit size={16} />}
                >
                  Edit
                </Button>
              </>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        size="sm"
        classNames={{
          base: "bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10",
          header: "border-b border-black/10 dark:border-white/10",
          body: "py-6",
          footer: "border-t border-black/10 dark:border-white/10",
        }}
      >
        <ModalContent>
          <ModalHeader>
            <span className="text-neutral-800 dark:text-neutral-200">
              Delete Memory
            </span>
          </ModalHeader>
          <ModalBody>
            <p className="text-neutral-600 dark:text-neutral-400">
              Are you sure you want to delete &quot;{memory.title}&quot;? This action
              cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => setShowDeleteConfirm(false)}
              isDisabled={isDeleting}
              className="text-neutral-600 dark:text-neutral-400"
            >
              Cancel
            </Button>
            <Button
              color="danger"
              onPress={handleDelete}
              isDisabled={isDeleting}
              startContent={
                isDeleting ? (
                  <IconLoader2 size={16} className="animate-spin" />
                ) : (
                  <IconTrash size={16} />
                )
              }
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
