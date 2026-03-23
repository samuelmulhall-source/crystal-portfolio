import Link from "next/link";
import type { WorkEntry } from "../../lib/content";
import { MediaBlock } from "./MediaBlock";

export function WorkCard({
  entry,
  variant = "default",
}: {
  entry: WorkEntry;
  variant?: "default" | "compact" | "feature";
}) {
  return (
    <article className={`work-card work-card--${variant}`}>
      <Link href={`/work/${entry.slug}`} className="work-card__media-link">
        <MediaBlock asset={entry.thumbnail} />
      </Link>

      <div className="work-card__body">
        <div className="work-card__meta">
          <span>{entry.format}</span>
          <span>{entry.year}</span>
        </div>
        <h3 className="work-card__title">
          <Link href={`/work/${entry.slug}`}>{entry.title}</Link>
        </h3>
        <p className="work-card__summary">{entry.summary}</p>
        <ul className="work-card__tags" aria-label={`${entry.title} tags`}>
          {entry.tags.slice(0, variant === "compact" ? 2 : 3).map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
        <Link href={`/work/${entry.slug}`} className="text-link">
          View project
        </Link>
      </div>
    </article>
  );
}
