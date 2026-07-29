/**
 * Serialises an object for embedding inside a `<script>` element.
 *
 * `JSON.stringify` escapes JSON metacharacters but not `<`, `>` or `&`. Inside
 * a script element the HTML tokenizer terminates on the literal bytes
 * `</script`, so any string field containing `</script>` breaks out of the
 * block and the rest is parsed as HTML. Escaping those three characters as
 * `\uXXXX` keeps the JSON semantically identical for consumers while making
 * the break-out impossible.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
