import { ogImageResponse, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const alt = "Circuvent Technologies — Engineering What's Next";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * Root Twitter/X preview card for https://circuvent.com.
 *
 * X reads twitter:image in preference to og:image; shipping both ensures
 * rich large-image link cards render properly across all platforms.
 */
export default function TwitterImage() {
  return ogImageResponse({
    domain: "circuvent.com",
    headline: "Engineering What's Next",
    description: "Intelligent systems at the intersection of AI, IoT, and Full-Stack Engineering. 53+ projects. 200K+ lines of code.",
    accent: "#0a1b44",
  });
}
