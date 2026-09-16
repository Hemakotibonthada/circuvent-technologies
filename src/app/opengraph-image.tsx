import { ogImageResponse, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const alt = "Circuvent Technologies — Engineering What's Next";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * Root OpenGraph preview card for https://circuvent.com.
 *
 * WhatsApp, Slack, LinkedIn, Twitter, iMessage and search engines pull this card
 * whenever a link to circuvent.com is pasted or previewed.
 */
export default function OpengraphImage() {
  return ogImageResponse({
    domain: "circuvent.com",
    headline: "Engineering What's Next",
    description: "Intelligent systems at the intersection of AI, IoT, and Full-Stack Engineering. 53+ projects. 200K+ lines of code.",
    accent: "#0a1b44",
  });
}
