import type { SiteSettings } from "../../lib/content";

/**
 * ContactSection — the one contact block, rendered identically on the home
 * page, /work and every detail page. All copy comes from site/settings.json
 * (`contact` + `brand`), so the heading, address and voice cannot drift
 * between pages.
 *
 * The email address itself is the call to action: it is shown in full (so it
 * can be read, copied or typed) and is the mailto link. The social link is the
 * quieter fallback.
 */
export function ContactSection({ site }: { site: SiteSettings }) {
  const { contact, brand } = site;
  const external = /^https?:/.test(contact.secondaryHref);

  return (
    <section id="contact" className="contact-section" aria-labelledby="contact-heading">
      <div className="page-shell contact-section__inner">
        <div className="contact-section__lead">
          <h2 id="contact-heading" className="contact-section__heading">
            {contact.heading}
          </h2>
          <p className="contact-section__availability">
            <span className="status-led" aria-hidden="true" />
            {contact.availability}
          </p>
        </div>

        <div className="contact-section__body">
          <a className="contact-email" href={contact.primaryHref}>
            {contact.primaryLabel}
          </a>
          <dl className="contact-meta">
            <div>
              <dt>Discipline</dt>
              <dd>{brand.studioLabel}</dd>
            </div>
            <div>
              <dt>Based</dt>
              <dd>{brand.location}</dd>
            </div>
          </dl>
          <div className="contact-actions">
            <a className="button-link" href={contact.primaryHref}>
              Email
            </a>
            <a
              className="button-link button-link--ghost"
              href={contact.secondaryHref}
              {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              {contact.secondaryLabel}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
