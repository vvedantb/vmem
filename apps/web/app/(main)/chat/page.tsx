"use client";

import PageContainer from "@/components/PageContainer";
import Chat from "@/components/Chat";

export default function ChatPage() {
  return (
    <PageContainer title="Chat" description="Ask questions about your memories">
      <div className="h-[calc(100vh-12rem)] min-h-[400px]">
        <Chat />
      </div>
    </PageContainer>
  );
}
