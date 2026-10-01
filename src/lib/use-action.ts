"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "./types";

/** Wrap server actions with pending state + toast feedback and instant router refresh. */
export function useAction() {
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = <T = undefined>(
    fn: () => Promise<ActionResult<T>>,
    opts?: { success?: string; onSuccess?: (data?: T) => void }
  ) => {
    start(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          if (opts?.success) toast.success(opts.success);
          router.refresh();
          opts?.onSuccess?.(res.data);
        } else {
          toast.error(res.error || "Something went wrong");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network error — please try again";
        toast.error(msg);
      }
    });
  };

  return { pending, run };
}

