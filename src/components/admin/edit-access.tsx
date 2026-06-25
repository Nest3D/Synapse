"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { setUserPermissions } from "@/app/(app)/admin/actions";
import { PermissionPicker, type TabOpt } from "@/components/admin/permission-picker";

/**
 * Per-user permission editor. Opens a modal pre-filled with the user's current
 * tab + field grants and saves the whole set via setUserPermissions.
 */
export function EditAccess({
  userId,
  userLabel,
  tabs,
  initialTabIds,
  initialFieldIds,
}: {
  userId: string;
  userLabel: string;
  tabs: TabOpt[];
  initialTabIds: string[];
  initialFieldIds: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [tabIds, setTabIds] = React.useState<string[]>(initialTabIds);
  const [fieldIds, setFieldIds] = React.useState<string[]>(initialFieldIds);

  const openEditor = () => {
    // Reset to the latest server state each time the modal opens.
    setTabIds(initialTabIds);
    setFieldIds(initialFieldIds);
    setOpen(true);
  };

  const save = () => {
    start(async () => {
      await setUserPermissions(userId, tabIds, fieldIds);
      setOpen(false);
    });
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={openEditor}>
        Edit access
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
              className="glass card-float w-full max-w-lg rounded-xl border border-border p-6"
            >
              <h2 className="font-display text-lg font-semibold">Edit access</h2>
              <p className="mt-1 text-sm text-muted">
                Broods and fields {userLabel} can see. Leave a brood&apos;s
                fields unchecked to grant all columns.
              </p>

              <div className="mt-4 max-h-[55vh] overflow-y-auto pr-1">
                <PermissionPicker
                  tabs={tabs}
                  tabIds={tabIds}
                  fieldIds={fieldIds}
                  onTabsChange={setTabIds}
                  onFieldsChange={setFieldIds}
                />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button size="sm" disabled={pending} onClick={save}>
                  Save access
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
