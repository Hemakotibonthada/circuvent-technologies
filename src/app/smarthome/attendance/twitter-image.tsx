import { ogImageResponse, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";
import { OG_CARD } from "@/lib/attendance-seo";

export const alt =
  "Circuvent Attendance — register, roll, cards, door readers and reports";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * Same artwork as the Open Graph card.
 *
 * It exists as its own route because X reads `twitter:image` in preference to
 * `og:image`; without this file a link posted there falls back to the Open
 * Graph tag, which works, but only while that fallback stays in place. Every
 * other app in the suite ships both for the same reason.
 */
export default function TwitterImage() {
  return ogImageResponse(OG_CARD);
}
