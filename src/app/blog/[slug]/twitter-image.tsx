// X/Twitter reads `twitter:image` in preference to `og:image`, so the route has
// to exist even though the artwork is identical.
export { default, alt, size, contentType, generateStaticParams } from "./opengraph-image";
