import { cn } from "@/lib/utils";

export function Brand({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const text =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";
  const dot = size === "lg" ? "h-2.5 w-2.5" : "h-2 w-2";
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "rounded-full bg-accent shadow-[0_0_14px_2px] shadow-accent/50",
          dot,
        )}
      />
      <span
        className={cn(
          "font-display font-extrabold tracking-tight text-ink lowercase",
          text,
        )}
      >
        synapse
      </span>
    </span>
  );
}
