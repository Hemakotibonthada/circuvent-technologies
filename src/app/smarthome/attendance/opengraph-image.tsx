import { ogImageResponse, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";
import { OG_CARD } from "@/lib/attendance-seo";

export const alt =
  "Circuvent Attendance — register, roll, cards, door readers and reports";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * The card shown when the attendance console is shared.
 *
 * Note where this is fetched from. The route is extensionless, and
 * `servedFromRoot` in lib/host-mounts.ts only exempts paths that look like a
 * file — so on attendance.circuvent.com a request for /opengraph-image is not
 * exempt, and the mount's empty `pages` list turns it into a redirect to the
 * main site. That is correct behaviour for a hostname serving exactly one
 * page, and it is why the tag must point at an absolute circuvent.com URL
 * rather than a path.
 *
 * Next handles that on its own: `metadataBase` in the root layout is
 * circuvent.com, so the emitted og:image is
 * https://circuvent.com/smarthome/attendance/opengraph-image, which unfurlers
 * fetch from the main site where this route really lives.
 */
export default function OpengraphImage() {
  return ogImageResponse(OG_CARD);
}
