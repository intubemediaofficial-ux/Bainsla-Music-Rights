import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Field({ label, hint, ...props }: React.ComponentProps<typeof Input> & { label: string; hint?: string }) {
  const id = props.id ?? props.name;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="h-10" {...props} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function NativeSelect({ label, children, ...props }: React.ComponentProps<"select"> & { label?: string }) {
  const sel = (
    <select
      {...props}
      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </select>
  );
  if (!label) return sel;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id ?? props.name}>{label}</Label>
      {sel}
    </div>
  );
}
