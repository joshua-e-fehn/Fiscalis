import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/shadcn/badge";
import type { Changelog } from "@/../services/docs/changelog";

/**
 * The changelog by month. Entries are the merged PR titles, so they stay in
 * the language they were written in; the page around them is translated.
 */
export async function ChangelogList({ changelog }: { changelog: Changelog }) {
  const t = await getTranslations("docs.changelog");
  const format = await getFormatter();

  if (changelog.months.length === 0) {
    return <p className="text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="space-y-10">
      <p className="text-muted-foreground text-sm">{t("entryLanguage")}</p>
      {changelog.months.map(({ month, entries }) => {
        // Noon UTC on the 1st: the same month in every time zone
        const date = new Date(`${month}-01T12:00:00Z`);
        return (
          <section key={month} className="space-y-3">
            <div className="flex items-baseline justify-between gap-4 border-b pb-2">
              <h2 className="text-xl font-semibold">
                {format.dateTime(date, { month: "long", year: "numeric", timeZone: "UTC" })}
              </h2>
              <span className="text-muted-foreground text-sm">
                {t("count", { count: entries.length })}
              </span>
            </div>
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li key={entry.pr} className="flex items-start gap-3 text-sm">
                  <Badge
                    variant={entry.type === "feature" ? "default" : "secondary"}
                    className="mt-0.5 w-24 shrink-0 justify-center"
                  >
                    {t(`types.${entry.type}`)}
                  </Badge>
                  <span className="flex-1">{entry.title}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {t("pr", { number: entry.pr })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
