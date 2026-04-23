"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";
import type { ConversationMessage, Profile } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";

export default function ConversationList() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const supabase = createSupabaseBrowser();

    const [{ data: msgs, error: msgsErr }, { data: profileList, error: usersErr }] = await Promise.all([
      supabase
        .from("conversation_messages")
        .select(
          "*, sender:profiles!conversation_messages_sender_id_fkey(id, full_name, email, role), recipient:profiles!conversation_messages_recipient_user_id_fkey(id, full_name, email, role)",
        )
        .order("created_at", { ascending: true })
        .limit(200),
      supabase
        .from("profiles")
        .select("id, full_name, email, role, preferred_provider, phone, department, avatar_url, created_at, updated_at")
        .order("full_name", { ascending: true }),
    ]);

    if (msgsErr) showToast(msgsErr.message, "error");
    if (usersErr) showToast(usersErr.message, "error");

    setMessages((msgs as ConversationMessage[]) || []);
    setUsers((profileList as Profile[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchData();
    const timer = setInterval(fetchData, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const getDisplayName = (profile: Partial<Profile> | null | undefined, fallback: string) => {
    if (!profile) return fallback;
    return profile.full_name || profile.email || fallback;
  };

  const parseRecipient = (raw: string): { scope: "admin" | "all" | "user"; recipientId: string | null; message: string } => {
    const text = raw.trim();
    if (!text) return { scope: "admin", recipientId: null, message: "" };

    if (/^@all\b/i.test(text)) {
      return { scope: "all", recipientId: null, message: text.replace(/^@all\s*/i, "").trim() || text };
    }

    if (/^@admin\b/i.test(text)) {
      return { scope: "admin", recipientId: null, message: text.replace(/^@admin\s*/i, "").trim() || text };
    }

    const tagged = text.match(/^@([^\s]+)\s+([\s\S]+)/);
    if (tagged) {
      const key = tagged[1].toLowerCase();
      const body = tagged[2].trim();
      const target = users.find((u) => {
        const email = (u.email || "").toLowerCase();
        const full = (u.full_name || "").toLowerCase().replace(/\s+/g, "");
        return email === key || full === key;
      });
      if (target) {
        return { scope: "user", recipientId: target.id, message: body || text };
      }
    }

    return { scope: "admin", recipientId: null, message: text };
  };

  const sendMessage = async () => {
    if (!user) return;
    const parsed = parseRecipient(content);
    if (!parsed.message) return;

    setSending(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("conversation_messages").insert({
      sender_id: user.id,
      recipient_scope: parsed.scope,
      recipient_user_id: parsed.recipientId,
      message: parsed.message,
    });

    setSending(false);

    if (error) {
      showToast(error.message, "error");
      return;
    }

    setContent("");
    fetchData();
  };

  const visibleUsers = users.filter((u) => u.id !== user?.id);

  if (!user) return <div className="rounded-lg bg-white p-4 text-sm text-slate-500">Please log in to chat.</div>;
  if (loading) return <div className="rounded-lg bg-white p-4 text-sm text-slate-500">Loading conversation...</div>;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        Mặc định: gửi cho admin. Dùng <span className="font-semibold">@all</span> để gửi toàn bộ, hoặc <span className="font-semibold">@email</span> để gửi người cụ thể.
      </div>

      <div className="max-h-[58vh] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
        {messages.length === 0 ? (
          <div className="text-sm text-slate-400">No messages yet.</div>
        ) : (
          messages.map((msg) => {
            const mine = msg.sender_id === user.id;
            const senderName = getDisplayName(msg.sender, "Unknown");
            const targetLabel =
              msg.recipient_scope === "all"
                ? "All"
                : msg.recipient_scope === "admin"
                  ? "Admin"
                  : getDisplayName(msg.recipient, "User");

            return (
              <div key={msg.id} className={`rounded-lg border p-2 ${mine ? "border-primary-200 bg-primary-50" : "border-slate-200 bg-slate-50"}`}>
                <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                  <span>
                    <span className="font-semibold text-slate-700">{senderName}</span> → {targetLabel}
                  </span>
                  <span>{new Date(msg.created_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{msg.message}</p>
              </div>
            );
          })
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        {visibleUsers.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {visibleUsers.slice(0, 10).map((u) => (
              <button
                key={u.id}
                onClick={() => setContent(`@${(u.email || u.full_name || "").replace(/\s+/g, "")} `)}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-200"
                title={u.email || ""}
              >
                @{u.full_name || u.email || "user"}
              </button>
            ))}
          </div>
        )}

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Nhập tin nhắn... (mặc định gửi admin)"
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={sendMessage}
            disabled={sending || !content.trim()}
            className="rounded-lg bg-primary-500 px-4 py-2 text-xs font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
