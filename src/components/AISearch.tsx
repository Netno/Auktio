"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import {
  Sparkles,
  Send,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import { formatSEK, timeLeft, imgSize } from "@/lib/utils";
import type { RAGSourceLot } from "@/lib/rag";
import type { HouseFacet } from "@/components/FilterBar";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: RAGSourceLot[];
  stats?: {
    vectorMatches: number;
    fulltextMatches: number;
    totalContextLots: number;
    queryTimeMs: number;
  };
  timestamp: Date;
}

const DEFAULT_EXAMPLE_QUERIES = [
  "Finns det några skandinaviska designmöbler från 50-talet?",
  "Vad kan du hitta inom silver under 1000 kr?",
  "Jämför priserna på mattor just nu",
  "Vilka föremål slutar snart som är bra fynd?",
];

interface AISearchProps {
  suggestedQueries?: string[];
}

export function AISearch({ suggestedQueries }: AISearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const resetChat = () => {
    if (loading) return;
    setMessages([]);
    setInput("");
  };

  const sendMessage = async (text?: string) => {
    const query = (text ?? input).trim();
    if (!query || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        throw new Error(`RAG request failed: ${res.status}`);
      }

      const data = await res.json();

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        sources: data.sources,
        stats: data.retrievalStats,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Jag kunde tyvärr inte söka just nu. Kontrollera att Gemini API-nyckeln är konfigurerad och försök igen.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2
          px-5 py-3 rounded-full shadow-elevated-lg transition-all duration-300
          ${
            isOpen
              ? "bg-brand-900 text-white scale-95"
              : "bg-gradient-to-r from-accent-500 to-accent-600 text-white hover:shadow-[0_12px_40px_rgba(196,93,62,0.3)] hover:scale-105"
          }`}
      >
        {isOpen ? (
          <>
            <ChevronDown size={18} />
            Stäng
          </>
        ) : (
          <>
            <Sparkles size={18} />
            AI-sök
          </>
        )}
      </button>

      {/* Chat panel */}
      <div
        className={`fixed bottom-20 right-6 z-50 w-[440px] max-h-[600px]
          bg-white rounded-2xl shadow-elevated-lg border border-brand-200
          flex flex-col overflow-hidden transition-all duration-300 origin-bottom-right
          ${isOpen ? "scale-100 opacity-100" : "scale-90 opacity-0 pointer-events-none"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-brand-100 bg-brand-50/50">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-400 to-accent-600
            flex items-center justify-center"
            >
              <Sparkles size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-brand-900">
                Auktio AI
              </h3>
              <p className="text-[11px] text-brand-400 truncate">
                Hitta föremål och jämför auktioner
              </p>
            </div>
          </div>
          <button
            onClick={resetChat}
            disabled={loading || (messages.length === 0 && !input.trim())}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-brand-500 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={12} />
            Återställ
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-[300px]">
          {messages.length === 0 ? (
            <EmptyState
              onSelectQuery={(q) => sendMessage(q)}
              suggestedQueries={suggestedQueries}
            />
          ) : (
            messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "user" ? (
                  <UserBubble content={msg.content} />
                ) : (
                  <AssistantBubble
                    content={msg.content}
                    sources={msg.sources}
                    stats={msg.stats}
                  />
                )}
              </div>
            ))
          )}

          {loading && (
            <div className="flex items-center gap-2 text-brand-400 text-sm py-2">
              <Loader2 size={16} className="animate-spin" />
              <span>Söker och analyserar...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-brand-100 bg-white">
          <div
            className="flex items-center gap-2 bg-brand-50 rounded-xl px-4 py-2.5
            border border-brand-200 focus-within:border-accent-400 transition-colors"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Fråga om auktioner..."
              className="flex-1 bg-transparent text-sm text-brand-900 placeholder:text-brand-400
                outline-none"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="p-1.5 rounded-lg bg-accent-500 text-white
                disabled:opacity-30 disabled:cursor-not-allowed
                hover:bg-accent-600 transition-colors"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** Empty state with example queries */
function EmptyState({
  onSelectQuery,
  suggestedQueries,
}: {
  onSelectQuery: (q: string) => void;
  suggestedQueries?: string[];
}) {
  const queries = suggestedQueries?.length
    ? suggestedQueries
    : DEFAULT_EXAMPLE_QUERIES;

  return (
    <div className="text-center py-6">
      <div
        className="w-12 h-12 rounded-full bg-gradient-to-br from-accent-100 to-gold-100
        flex items-center justify-center mx-auto mb-3"
      >
        <MessageSquare size={22} className="text-accent-500" />
      </div>
      <h4 className="font-medium text-sm text-brand-900 mb-1">
        Fråga mig om auktioner
      </h4>
      <p className="text-xs text-brand-400 mb-4">
        Jag hjälper dig att hitta relevanta föremål och jämföra alternativ
      </p>
      <div className="space-y-2">
        {queries.map((q) => (
          <button
            key={q}
            onClick={() => onSelectQuery(q)}
            className="w-full text-left text-xs text-brand-600 bg-brand-50 hover:bg-brand-100
              px-3 py-2.5 rounded-lg transition-colors border border-brand-100 hover:border-brand-200"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

/** User message bubble */
function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] bg-accent-500 text-white px-4 py-2.5 rounded-2xl rounded-br-md text-sm">
        {content}
      </div>
    </div>
  );
}

/** Assistant message bubble with sources */
function AssistantBubble({
  content,
  sources,
  stats,
}: {
  content: string;
  sources?: RAGSourceLot[];
  stats?: Message["stats"];
}) {
  const [showSources, setShowSources] = useState(Boolean(sources?.length));

  return (
    <div className="space-y-2">
      {/* Answer */}
      <div className="max-w-[95%] bg-brand-50 border border-brand-100 px-4 py-3 rounded-2xl rounded-bl-md text-sm text-brand-800 leading-relaxed">
        <div className="whitespace-pre-wrap">{content}</div>
      </div>

      {/* Stats + sources toggle */}
      {(sources?.length || stats) && (
        <div className="flex items-center gap-3 ml-1">
          {stats && (
            <span className="text-[10px] text-brand-400 flex items-center gap-1">
              <Zap size={10} />
              {stats.totalContextLots} träffar · {stats.queryTimeMs}ms
            </span>
          )}
          {sources && sources.length > 0 && (
            <button
              onClick={() => setShowSources(!showSources)}
              className="text-[11px] text-accent-500 hover:text-accent-600 flex items-center gap-1 font-medium"
            >
              {showSources ? (
                <ChevronUp size={12} />
              ) : (
                <ChevronDown size={12} />
              )}
              {showSources
                ? "Dölj föremål"
                : `Visa föremål (${sources.length})`}
            </button>
          )}
        </div>
      )}

      {/* Source cards */}
      {showSources && sources && (
        <div className="space-y-1.5 ml-1 animate-fade-in">
          {sources.slice(0, 6).map((lot) => (
            <SourceCard key={lot.id} lot={lot} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact source card */
function SourceCard({
  lot,
  compact = false,
}: {
  lot: RAGSourceLot;
  compact?: boolean;
}) {
  const tl = lot.endTime ? timeLeft(lot.endTime) : null;
  const hasEstimate = lot.estimate != null && lot.estimate > 0;
  const hasBid = lot.currentBid != null && lot.currentBid > 0;
  const showBid = hasBid && (!hasEstimate || lot.currentBid! > lot.estimate!);
  const displayPrice = showBid
    ? { label: "Bud", value: lot.currentBid! }
    : hasEstimate
      ? { label: "Utrop", value: lot.estimate! }
      : hasBid
        ? { label: "Bud", value: lot.currentBid! }
        : null;

  return (
    <a
      href={lot.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex gap-3 bg-white border border-brand-100 rounded-xl
        hover:border-brand-200 hover:shadow-card transition-all group"
        ${compact ? "p-2" : "p-2.5"}`}
    >
      {/* Thumbnail */}
      {lot.thumbnailUrl && (
        <div
          className={`${compact ? "w-12 h-12" : "w-14 h-14"} rounded-lg overflow-hidden bg-brand-100 shrink-0`}
        >
          <Image
            src={imgSize(lot.thumbnailUrl, "med")!}
            alt={lot.title}
            width={compact ? 48 : 56}
            height={compact ? 48 : 56}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-brand-400 truncate">
          {lot.houseName} · {lot.city}
        </div>
        <div
          className={`${compact ? "text-[12px]" : "text-xs"} font-medium text-brand-900 line-clamp-1 mb-1`}
        >
          {lot.title}
        </div>
        <div className="flex items-center gap-3 text-[11px] flex-wrap">
          {displayPrice && (
            <span className="font-semibold text-brand-800">
              {displayPrice.label} {formatSEK(displayPrice.value)}
            </span>
          )}
          {tl && (
            <span
              className={`${tl.urgent ? "text-accent-500" : "text-brand-400"}`}
            >
              {tl.text}
            </span>
          )}
          {lot.similarity != null && (
            <span className="text-brand-300">
              {Math.round(lot.similarity * 100)}% match
            </span>
          )}
        </div>
      </div>

      <ExternalLink
        size={12}
        className="text-brand-300 group-hover:text-accent-500 shrink-0 mt-1 transition-colors"
      />
    </a>
  );
}
