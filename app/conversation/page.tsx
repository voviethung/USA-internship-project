import React from 'react';
import dynamic from 'next/dynamic';
const ConversationList = dynamic(() => import('./ConversationList'), { ssr: false });

export default function ConversationPage() {
  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold">💬 Team Conversation</h1>
      <ConversationList />
    </div>
  );
}
