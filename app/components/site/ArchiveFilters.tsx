"use client";

import { useMemo, useState } from "react";
import type { WorkEntry } from "../../lib/content";
import { WorkCard } from "./WorkCard";

export function ArchiveFilters({
  entries,
}: {
  entries: WorkEntry[];
}) {
  const filters = useMemo(
    () => ["All", ...new Set(entries.map((entry) => entry.format))],
    [entries],
  );
  const [activeFilter, setActiveFilter] = useState("All");

  const visibleEntries = useMemo(
    () => activeFilter === "All"
      ? entries
      : entries.filter((entry) => entry.format === activeFilter),
    [activeFilter, entries],
  );

  return (
    <div className="archive">
      <div className="archive__filters" role="group" aria-label="Archive format filters">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`chip${activeFilter === filter ? " is-active" : ""}`}
            aria-pressed={activeFilter === filter}
            onClick={() => setActiveFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="archive__grid">
        {visibleEntries.map((entry) => (
          <WorkCard key={entry.slug} entry={entry} />
        ))}
      </div>
    </div>
  );
}
