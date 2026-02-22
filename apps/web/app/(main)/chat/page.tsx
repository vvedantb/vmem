"use client";

import PageContainer from "@/components/PageContainer";
import Chat from "@/components/Chat";

export default function ChatPage() {
  return (
    <PageContainer title="Chat">
      <div className="h-full min-h-96">
        <Chat />
      </div>
    </PageContainer>
  );
}
