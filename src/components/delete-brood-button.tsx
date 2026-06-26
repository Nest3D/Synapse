"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteTab } from "@/app/(app)/admin/actions";

export function DeleteBroodButton({
  tabId,
  name,
}: {
  tabId: string;
  name: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const router = useRouter();

  const confirm = () => {
    start(async () => {
      await deleteTab(tabId);
      router.push("/");
    });
  };

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-3.5 w-3.5" /> Delete brood
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => !pending && setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="glass card-float w-full max-w-sm rounded-xl border border-border p-6"
            >
              <h2 className="font-display text-lg font-semibold">
                Delete brood?
              </h2>
              <p className="mt-2 text-sm text-muted">
                This permanently deletes{" "}
                <span className="font-medium text-ink">{name}</span> and all of
                its tasks. This can&apos;t be undone.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={confirm}
                >
                  Delete
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
