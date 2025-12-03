import { Card, CardBody } from "@heroui/card";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { IconMessage, IconSend } from "@tabler/icons-react";

export default function ChatPage() {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-black dark:text-white">
          Chat
        </h2>
        <p className="text-neutral-500 mt-2">
          Ask questions about your memories
        </p>
      </div>

      <div className="flex flex-col h-[calc(100vh-280px)] min-h-[400px]">
        <Card
          classNames={{
            base: "flex-1 border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none overflow-hidden",
          }}
        >
          <CardBody className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="w-16 h-16 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center mb-6">
              <IconMessage className="w-8 h-8 text-neutral-400" stroke={1.5} />
            </div>
            <h3 className="text-lg font-medium text-black dark:text-white mb-2">
              Start a conversation
            </h3>
            <p className="text-neutral-500 max-w-sm">
              Ask anything about your stored memories. The AI will search and
              reference relevant information.
            </p>
          </CardBody>
        </Card>

        <div className="mt-4 flex gap-3">
          <Input
            type="text"
            placeholder="Ask about your memories..."
            size="lg"
            classNames={{
              inputWrapper:
                "bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-white dark:data-[hover=true]:bg-neutral-800",
              input: "text-black dark:text-white",
            }}
          />
          <Button
            isIconOnly
            size="lg"
            className="bg-black dark:bg-white text-white dark:text-black min-w-14 h-14"
          >
            <IconSend size={20} stroke={1.5} />
          </Button>
        </div>
      </div>
    </div>
  );
}
