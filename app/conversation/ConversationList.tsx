"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";
import type { Conversation, ConversationSegment } from "@/lib/types";

export default function ConversationList() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [segments, setSegments] = useState<Record<string, ConversationSegment[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const supabase = createSupabaseBrowser();
      // Get all conversations for current user
      const { data: convs } = await supabase
        .from("conversations")
        .select("*")
        .order("created_at", { ascending: false });
      setConversations(convs || []);
      // Fetch segments for each conversation
      const segs: Record<string, ConversationSegment[]> = {};
      for (const conv of convs || []) {
        const { data: seg } = await supabase
          .from("conversation_segments")
          .select("*")
          .eq("conversation_id", conv.id)
          .order("start_time");
        segs[conv.id] = seg || [];
      }
      setSegments(segs);
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) return <div>Loading conversations...</div>;
  if (conversations.length === 0) return <div>No conversations found.</div>;

  // Helper: detect if text is English (simple check)
  function isEnglish(text: string) {
    return /[a-zA-Z]/.test(text) && !/[\u00C0-\u1EF9]/.test(text);
  }

  // Play TTS for a segment
  function playTTS(text: string, lang: string) {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const utter = new window.SpeechSynthesisUtterance(text);
      utter.lang = lang;
      window.speechSynthesis.speak(utter);
    }
  }

  return (
    <div className="space-y-6">
      {conversations.map((conv) => (
        <div key={conv.id} className="border rounded-lg p-4 bg-white shadow">
          <div className="font-semibold text-primary-700 mb-2">
            {new Date(conv.created_at).toLocaleString()} — {segments[conv.id]?.length || 0} segment(s)
          </div>
          <div className="space-y-2">
            {segments[conv.id]?.map((seg) => (
              <div key={seg.id} className="pl-2 border-l-4 border-blue-300 mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-slate-400">Speaker: {seg.speaker}</span>
                  <button
                    className="ml-2 text-blue-500 hover:text-blue-700 text-lg"
                    title="Phát đoạn này"
                    onClick={() => playTTS(seg.transcript, isEnglish(seg.transcript) ? 'en-US' : 'vi-VN')}
                  >
                    🔊
                  </button>
                </div>
                <div className="text-sm whitespace-pre-line">{seg.transcript}</div>
                {/* Nếu là tiếng Anh và có nghĩa tiếng Việt, hiển thị nghĩa */}
                {isEnglish(seg.transcript) && conv.translated_vi && (
                  <div className="text-xs text-green-700 bg-green-50 rounded px-2 py-1 mt-1">
                    <span className="font-semibold">Nghĩa tiếng Việt:</span> {conv.translated_vi}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
