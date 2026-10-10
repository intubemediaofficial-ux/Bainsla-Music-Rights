import { Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-500/30">
        <Music2 className="size-5 text-white" />
      </div>
      <div className="leading-tight">
        <div className={cn("text-[15px] font-semibold tracking-tight", light ? "text-white" : "text-foreground")}>Music Rights Cloud</div>
        <div className={cn("text-[11px]", light ? "text-white/60" : "text-muted-foreground")}>Copyright &amp; ownership</div>
      </div>
    </div>
  );
}
