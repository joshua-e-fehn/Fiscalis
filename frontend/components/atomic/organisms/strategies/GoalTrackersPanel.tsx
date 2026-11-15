"use client";

/**
 * GoalTrackersPanel
 *
 * The things the user attests for goals (convex/goals.ts trackers): add a
 * count (workouts) or a measurement (a 10 km time), log entries, look at
 * and remove recent ones, and delete a tracker no goal uses. Fiscalis
 * trusts these entries; only those dated on or after a goal's start count
 * for it.
 */

import { useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import type { Id } from "@/convex/_generated/dataModel";
import {
  useCreateTracker,
  useLogEntry,
  useRemoveEntry,
  useRemoveTracker,
  useTrackerEntries,
  type TrackerView,
} from "@/hooks/convex/goals";
import { useErrorMessage } from "@/i18n/errors";
import { useLocalToday } from "@/hooks/useLocalToday";
import { parseTypedAmount } from "@/../services/i18n/typedAmount";

export function GoalTrackersPanel({ trackers }: { trackers: readonly TrackerView[] }) {
  const t = useTranslations("strategies.goals.trackers");
  const errorMessage = useErrorMessage();
  const createTracker = useCreateTracker();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [kind, setKind] = useState<"count" | "measurement">("count");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    setSaving(true);
    try {
      await createTracker({ name, kind, unit: unit || undefined });
      toast.success(t("created", { name: name.trim() }));
      setName("");
      setUnit("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {trackers.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {trackers.map((tracker) => (
          <TrackerRow key={tracker._id} tracker={tracker} />
        ))}
        <div className="grid gap-2 sm:grid-cols-[1fr_9rem_7rem_auto]">
          <Input value={name} placeholder={t("namePlaceholder")} aria-label={t("name")} onChange={(e) => setName(e.target.value)} />
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger aria-label={t("kind")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="count">{t("kinds.count")}</SelectItem>
              <SelectItem value="measurement">{t("kinds.measurement")}</SelectItem>
            </SelectContent>
          </Select>
          <Input value={unit} placeholder={t("unitPlaceholder")} aria-label={t("unit")} onChange={(e) => setUnit(e.target.value)} />
          <Button onClick={() => void add()} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Plus className="me-1 h-4 w-4" />}
            {t("add")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TrackerRow({ tracker }: { tracker: TrackerView }) {
  const t = useTranslations("strategies.goals.trackers");
  const format = useFormatter();
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const logEntry = useLogEntry();
  const removeTracker = useRemoveTracker();
  // The viewer's own day: the server accepts days up to the furthest time zone ahead of UTC
  const today = useLocalToday();
  const [date, setDate] = useState(today);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [value, setValue] = useState(tracker.kind === "count" ? "1" : "");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const num = (v: number) => format.number(v, { maximumFractionDigits: 2 });
  const log = async () => {
    const parsed = parseTypedAmount(value, locale);
    if (parsed === undefined) return;
    setSaving(true);
    try {
      await logEntry({ trackerId: tracker._id, date, value: parsed });
      toast.success(t("logged", { name: tracker.name }));
      if (tracker.kind === "measurement") setValue("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    try {
      await removeTracker({ trackerId: tracker._id });
      toast.success(t("deleted", { name: tracker.name }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{tracker.name}</div>
          <div className="text-xs text-muted-foreground">
            {tracker.kind === "count"
              ? t("countSummary", { total: num(tracker.total), unit: tracker.unit ?? "" })
              : tracker.latest
                ? t("measurementSummary", { value: num(tracker.latest.value), unit: tracker.unit ?? "" })
                : t("noEntries")}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-36" type="date" aria-label={t("date")} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          <Input className="w-24" inputMode="decimal" aria-label={t("value")} value={value} onChange={(e) => setValue(e.target.value)} />
          <Button size="sm" onClick={() => void log()} disabled={saving || !value}>
            {t("log")}
          </Button>
          <Button variant="ghost" size="icon" aria-label={t(open ? "hideEntries" : "showEntries")} onClick={() => setOpen(!open)}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          {confirmDelete ? (
            <Button variant="destructive" size="sm" onClick={() => void remove()} onBlur={() => setConfirmDelete(false)}>
              {t("delete")}
            </Button>
          ) : (
            <Button variant="ghost" size="icon" aria-label={t("delete")} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {open && <EntryList trackerId={tracker._id} />}
    </div>
  );
}

function EntryList({ trackerId }: { trackerId: Id<"goalTrackers"> }) {
  const t = useTranslations("strategies.goals.trackers");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const entries = useTrackerEntries(trackerId);
  const removeEntry = useRemoveEntry();
  if (entries === undefined) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">{t("noEntries")}</p>;
  return (
    <ul className="divide-y text-sm">
      {entries.map((e) => (
        <li key={e._id} className="flex items-center justify-between gap-2 py-1">
          <span>
            {format.dateTime(new Date(`${e.date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}
          </span>
          <span className="flex items-center gap-2 tabular-nums">
            {format.number(e.value, { maximumFractionDigits: 2 })}
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("deleteEntry")}
              onClick={() =>
                void removeEntry({ entryId: e._id }).catch((err: unknown) => toast.error(errorMessage(err)))
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}
