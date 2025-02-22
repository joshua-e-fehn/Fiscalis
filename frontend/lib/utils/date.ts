type DateFormatType = "short" | "date" | "full";

export function formatDate(date: Date, type: DateFormatType = "full"): string {
  const options: Intl.DateTimeFormatOptions = {
    hour12: false,
    ...(type === "short" && {
      hour: "2-digit",
      minute: "2-digit",
    }),
    ...(type === "date" && {
      day: "2-digit",
      month: "2-digit",
    }),
    ...(type === "full" && {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };

  return new Intl.DateTimeFormat("de-DE", options).format(date);
}
