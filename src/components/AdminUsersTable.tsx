"use client";

import { useState, useTransition } from "react";
import type { AppUser, AppUserRole } from "@/lib/app-users";

type AdminUsersTableProps = {
  users: AppUser[];
};

const ROLE_OPTIONS: AppUserRole[] = ["user", "admin", "owner"];

export function AdminUsersTable({ users }: AdminUsersTableProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateRole(userId: string, role: AppUserRole) {
    setPendingId(userId);
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/users/role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, role }),
        });

        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          setMessage(payload.error ?? "Misslyckades");
          return;
        }

        setMessage(`roll uppdaterad: ${role}`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Misslyckades");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="border border-brand-200 bg-white">
      <div className="border-b border-brand-200 px-3 py-2 font-mono text-[12px] text-brand-900">
        användare
      </div>
      {message && (
        <div className="border-b border-brand-200 px-3 py-2 text-[12px] text-brand-600">
          {message}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-[12px]">
          <thead className="border-b border-brand-200 bg-brand-50 text-brand-700">
            <tr>
              <th className="px-2 py-1 text-left font-medium">namn</th>
              <th className="px-2 py-1 text-left font-medium">email</th>
              <th className="px-2 py-1 text-left font-medium">roll</th>
              <th className="px-2 py-1 text-left font-medium">senast</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-brand-100 text-brand-800"
              >
                <td className="px-2 py-1">{user.name ?? "-"}</td>
                <td className="px-2 py-1">{user.email}</td>
                <td className="px-2 py-1">
                  <select
                    defaultValue={user.role}
                    disabled={isPending && pendingId === user.id}
                    onChange={(event) =>
                      updateRole(user.id, event.target.value as AppUserRole)
                    }
                    className="h-7 border border-brand-200 bg-white px-2 text-[12px]"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1 whitespace-nowrap text-brand-500">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString("sv-SE", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
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
