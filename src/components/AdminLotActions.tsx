"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminLotRecord } from "@/lib/admin-dashboard";

type AdminLotActionsProps = {
  lots: AdminLotRecord[];
};

type TaskKey = "subjects" | "vision" | "embedding";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("sv-SE", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMissingLabel(value: string) {
  switch (value) {
    case "categories":
      return "Kategorier";
    case "ai-tags":
      return "AI-taggar";
    case "image-description":
      return "Bildbeskrivning";
    case "embedding":
      return "Embedding";
    default:
      return value;
  }
}

export function AdminLotActions({ lots }: AdminLotActionsProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [resultText, setResultText] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [tasks, setTasks] = useState<Record<TaskKey, boolean>>({
    subjects: true,
    vision: false,
    embedding: true,
  });

  const visibleIds = useMemo(() => lots.map((lot) => lot.id), [lots]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  function toggleLot(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  function toggleTask(task: TaskKey) {
    setTasks((current) => ({ ...current, [task]: !current[task] }));
  }

  function runUpdate() {
    const activeTasks = (Object.entries(tasks) as Array<[TaskKey, boolean]>)
      .filter(([, enabled]) => enabled)
      .map(([task]) => task);

    if (selectedIds.length === 0 || activeTasks.length === 0) {
      return;
    }

    setResultText(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/lots/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lotIds: selectedIds, tasks: activeTasks }),
        });

        const payload = (await response.json()) as {
          error?: string;
          results?: Record<string, { processed?: number; errors?: number }>;
        };

        if (!response.ok) {
          setResultText(payload.error ?? "Misslyckades");
          return;
        }

        const summary = Object.entries(payload.results ?? {})
          .map(
            ([task, result]) =>
              `${task}:${result.processed ?? 0}/${result.errors ?? 0}`,
          )
          .join(" ");

        setResultText(summary || "klart");
        setSelectedIds([]);
        router.refresh();
      } catch (error) {
        setResultText(error instanceof Error ? error.message : "Misslyckades");
      }
    });
  }

  return (
    <div className="border border-brand-200 bg-white">
      <div className="border-b border-brand-200 px-3 py-2 font-mono text-[12px] text-brand-900">
        lotter med saknad data
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-brand-200 px-3 py-2 text-[12px]">
        <label className="inline-flex items-center gap-1 text-brand-700">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
          />
          alla synliga
        </label>
        <span className="text-brand-500">valda: {selectedIds.length}</span>
        <span className="text-brand-300">|</span>
        <label className="inline-flex items-center gap-1 text-brand-700">
          <input
            type="checkbox"
            checked={tasks.subjects}
            onChange={() => toggleTask("subjects")}
          />
          ai/kat
        </label>
        <label className="inline-flex items-center gap-1 text-brand-700">
          <input
            type="checkbox"
            checked={tasks.vision}
            onChange={() => toggleTask("vision")}
          />
          bild
        </label>
        <label className="inline-flex items-center gap-1 text-brand-700">
          <input
            type="checkbox"
            checked={tasks.embedding}
            onChange={() => toggleTask("embedding")}
          />
          emb
        </label>
        <button
          type="button"
          onClick={runUpdate}
          disabled={isPending || selectedIds.length === 0}
          className="h-7 border border-brand-900 bg-brand-900 px-2 text-[12px] text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "kör..." : "uppdatera valda"}
        </button>
        {resultText && <span className="text-brand-600">{resultText}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[12px]">
          <thead className="border-b border-brand-200 bg-brand-50 text-brand-700">
            <tr>
              <th className="px-2 py-1 text-left font-medium">x</th>
              <th className="px-2 py-1 text-left font-medium">id</th>
              <th className="px-2 py-1 text-left font-medium">titel</th>
              <th className="px-2 py-1 text-left font-medium">hus</th>
              <th className="px-2 py-1 text-left font-medium">saknas</th>
              <th className="px-2 py-1 text-right font-medium">slut</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => (
              <tr
                key={lot.id}
                className="border-b border-brand-100 align-top text-brand-800"
              >
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(lot.id)}
                    onChange={() => toggleLot(lot.id)}
                  />
                </td>
                <td className="px-2 py-1 font-mono text-brand-500">{lot.id}</td>
                <td className="min-w-[320px] px-2 py-1">{lot.title}</td>
                <td className="whitespace-nowrap px-2 py-1">{lot.houseName}</td>
                <td className="px-2 py-1">
                  <div className="flex flex-wrap gap-1">
                    {lot.missing.map((item) => (
                      <span
                        key={item}
                        className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800"
                      >
                        {formatMissingLabel(item)}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap text-brand-500">
                  {lot.endTime
                    ? formatDateTime(lot.endTime)
                    : lot.isActive
                      ? "aktiv"
                      : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
