"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setBroodPrivacy } from "@/app/(app)/admin/actions";

export function BroodPrivacyToggle({
  tabId,
  isPrivate,
}: {
  tabId: string;
  isPrivate: boolean;
}) {
  const [pending, start] = React.useTransition();
  const router = useRouter();

  const toggle = () =>
    start(async () => {
      await setBroodPrivacy(tabId, !isPrivate);
      router.refresh();
    });

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={toggle}>
      {isPrivate ? (
        <>
          <Globe className="h-3.5 w-3.5" /> Make shared
        </>
      ) : (
        <>
          <Lock className="h-3.5 w-3.5" /> Make private
        </>
      )}
    </Button>
  );
}
