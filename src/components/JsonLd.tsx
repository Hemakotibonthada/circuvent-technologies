/**
 * Renders one or more JSON-LD structured-data blocks. Safe to use in server
 * components and layouts — the payload is serialized with JSON.stringify only
 * (no user-controlled HTML), matching the pattern used in the root layout.
 */
export default function JsonLd({ data }: { data: object | object[] }) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}
