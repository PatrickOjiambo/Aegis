/**
 * Client-side content hashing for evidence items.
 *
 * The backend stores evidence by a 32-byte content digest (`Hex32` — 64 lower
 * hex chars, no 0x) so nothing can be swapped after submission (NFR-5). We
 * compute a SHA-256 digest in the browser via Web Crypto, which satisfies the
 * shape and keeps the reference tied to the exact bytes the user submitted.
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/** Hash the canonical content of an evidence item (value or ref + description). */
export async function hashEvidenceContent(parts: {
  value?: string | number | boolean
  ref?: string
  description?: string
}): Promise<string> {
  const canonical = JSON.stringify({
    value: parts.value ?? null,
    ref: parts.ref ?? null,
    description: parts.description ?? null,
  })
  return sha256Hex(canonical)
}
