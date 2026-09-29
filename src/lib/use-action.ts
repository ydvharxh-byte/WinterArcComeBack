"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "./types";

/** Wrap server actions with pending state + toast feedback. */
export function useAction() {
  const [pending, start] = useTransition();

  const run = <T = undefined>(
    fn: () => Promise<ActionResult<T>>,
    opts?: { success?: string; onSuccess?: (data?: T) => void }
  ) => {
    start(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          if (opts?.success) toast.success(opts.success);
          opts?.onSuccess?.(res.data);
        } else {
          toast.error(res.error || "Something went wrong");
        }
      } catch {
        toast.error("Network error — please try again");
      }
    });
  };

  return { pending, run };
}
