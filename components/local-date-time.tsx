"use client";

import { useEffect, useState } from "react";

export function LocalDateTime({ value, timeZone, dateOnly = false }: { value: Date; timeZone: string; dateOnly?: boolean }) {
  const [formatted, setFormatted] = useState("");

  useEffect(() => {
    const options: Intl.DateTimeFormatOptions = dateOnly
      ? { dateStyle: "full" }
      : { dateStyle: "medium", timeStyle: "short" };
    setFormatted(new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(value));
  }, [dateOnly, timeZone, value]);

  return <time dateTime={value.toISOString()}>{formatted || "—"}</time>;
}