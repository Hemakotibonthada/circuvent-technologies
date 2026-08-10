/**
 * Who the company is, in one place.
 *
 * The support address was typed into the invoice and typed again as the
 * reply-to on every outbound email, and the two had already drifted — the
 * invoice offered a personal address, which is the one a customer keeps
 * writing to after the person has moved on. Anything a customer reads and
 * replies to belongs here rather than in the component that happens to render
 * it.
 *
 * No secrets. These are the details printed on documents and shown on the
 * public site.
 */

export const BRAND = {
  name: "Circuvent Technologies",
  site: "circuvent.com",
  /** Monitored inbox. Never a personal address: a customer replies to whatever
      the invoice said, sometimes years later. */
  supportEmail: "support@circuvent.com",
  warrantyUrl: "circuvent.com/warranty",
} as const;

/** The line under the logo on every customer document. */
export function documentContactLine(): string {
  return `${BRAND.site} · support: ${BRAND.supportEmail}`;
}
