import React from 'react';
import dynamic from 'next/dynamic';
const ConversationList = dynamic(() => import('./ConversationList'), { ssr: false });

export default function ConversationPage() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Conversations</h1>
      <ConversationList />
    </div>
  );
}
