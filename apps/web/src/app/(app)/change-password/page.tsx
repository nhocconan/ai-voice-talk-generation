"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/lib/trpc/client";

export default function ChangePasswordPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const mutation = api.user.changePassword.useMutation({
    onSuccess: () => router.push("/dashboard"),
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError(t("passwordMismatch"));
      return;
    }
    if (newPassword.length < 8) {
      setError(t("passwordMinLength"));
      return;
    }
    mutation.mutate({ newPassword });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-1)]">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-8 shadow-[var(--shadow-card)]">
        <h1 className="mb-2 font-display text-2xl font-semibold text-[var(--color-text-primary)]">
          {t("changePassword")}
        </h1>
        <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
          {t("forceChangeDesc")}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">
              {t("newPassword")}
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">
              {t("confirmPassword")}
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--color-danger)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full rounded-[var(--radius-warm-btn)] bg-[var(--color-accent)] py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {mutation.isPending ? t("saving") : t("setNewPassword")}
          </button>
        </form>
      </div>
    </div>
  );
}
