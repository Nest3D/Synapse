"use client";

import * as React from "react";

export type FieldOpt = { id: string; key: string; label: string };
export type TabOpt = { id: string; name: string; fields: FieldOpt[] };

/**
 * Tab + field permission checkbox tree, shared by the invite form and the
 * per-user permission editor. Controlled: parent owns tabIds/fieldIds state.
 * Checking a tab grants page access; checking fields within it restricts the
 * visible columns (no field checked = all columns, the opt-in default).
 */
export function PermissionPicker({
  tabs,
  tabIds,
  fieldIds,
  onTabsChange,
  onFieldsChange,
}: {
  tabs: TabOpt[];
  tabIds: string[];
  fieldIds: string[];
  onTabsChange: (v: string[]) => void;
  onFieldsChange: (v: string[]) => void;
}) {
  const toggleField = (id: string) =>
    onFieldsChange(
      fieldIds.includes(id)
        ? fieldIds.filter((x) => x !== id)
        : [...fieldIds, id],
    );

  const toggleTab = (tab: TabOpt) => {
    if (tabIds.includes(tab.id)) {
      onTabsChange(tabIds.filter((x) => x !== tab.id));
      // Drop field grants belonging to the tab we just removed.
      const owned = new Set(tab.fields.map((f) => f.id));
      onFieldsChange(fieldIds.filter((id) => !owned.has(id)));
    } else {
      onTabsChange([...tabIds, tab.id]);
    }
  };

  return (
    <div className="space-y-3">
      {tabs.map((tab) => {
        const on = tabIds.includes(tab.id);
        return (
          <div key={tab.id} className="rounded-lg border border-border-soft p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggleTab(tab)}
              />
              {tab.name}
            </label>
            {on && (
              <div className="mt-2 flex flex-wrap gap-3 pl-6">
                {tab.fields.map((f) => (
                  <label
                    key={f.id}
                    className="flex items-center gap-1.5 text-xs text-muted"
                  >
                    <input
                      type="checkbox"
                      checked={fieldIds.includes(f.id)}
                      onChange={() => toggleField(f.id)}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
