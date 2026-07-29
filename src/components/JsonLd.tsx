import { jsonForScript } from "@/lib/json-script";

/**
 * Renders one or more JSON-LD structured-data blocks.
 *
 * The payload reaches an HTML sink, and its fields (product names,
 * descriptions, slugs) are editable through the admin API — so it is
 * serialised with `jsonForScript`, which escapes `<`, `>` and `&` and stops a
 * stored `</script>` from breaking out of the block on a public page.
 */
export default function JsonLd({ data }: { data: object | object[] }) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonForScript(item) }}
        />
      ))}
    </>
  );
}
