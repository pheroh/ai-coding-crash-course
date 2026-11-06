import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";

/**
 * A headline metric: label, big value, and a short subtitle.
 * Pass `value={null}` when the metric cannot be computed — it renders "—".
 */
export function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
}: {
  label: string;
  value: string | null;
  subtitle: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="gap-2 py-5">
      <CardContent className="space-y-1 px-5">
        <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          <span>{label}</span>
          {Icon && <Icon className="size-4" />}
        </div>
        <div className="text-3xl font-bold tracking-tight">{value ?? "—"}</div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
