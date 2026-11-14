/**
 * Turns the plain-text bodies of the legal pages (frontend/messages/<lang>/
 * legal.json) into blocks the page renders. Keeping the legal copy as plain
 * text in the catalogues lets it be translated like any other string.
 *
 * Format of a body:
 *  - blocks are separated by a blank line;
 *  - a block whose lines all start with "- " is a bulleted list;
 *  - any other block is a paragraph (single newlines become line breaks).
 *
 * Inside a line, `https://…` URLs and e-mail addresses become links, and
 * `[PLACEHOLDER: …]` marks a fact the owner still has to fill in.
 */

export type LegalInline =
  | { kind: "text"; text: string }
  | { kind: "link"; href: string; text: string }
  | { kind: "placeholder"; text: string };

/** One line of a paragraph or one list item. */
export type LegalLine = LegalInline[];

export type LegalBlock =
  | { type: "paragraph"; lines: LegalLine[] }
  | { type: "list"; items: LegalLine[] };

const INLINE_PATTERN =
  /\[PLACEHOLDER:\s*([^\]]+)\]|(https:\/\/[^\s)]+[^\s).,;:])|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

export function parseLegalInline(line: string): LegalLine {
  const out: LegalLine = [];
  let last = 0;
  for (const match of line.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ kind: "text", text: line.slice(last, index) });
    const [whole, placeholder, url, email] = match;
    if (placeholder !== undefined) {
      out.push({ kind: "placeholder", text: placeholder.trim() });
    } else if (url !== undefined) {
      out.push({ kind: "link", href: url, text: url });
    } else if (email !== undefined) {
      out.push({ kind: "link", href: `mailto:${email}`, text: email });
    }
    last = index + whole.length;
  }
  if (last < line.length) out.push({ kind: "text", text: line.slice(last) });
  return out;
}

export function parseLegalBlocks(body: string): LegalBlock[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0)
    .map((lines): LegalBlock =>
      lines.every((line) => line.startsWith("- "))
        ? {
            type: "list",
            items: lines.map((line) => parseLegalInline(line.slice(2).trim())),
          }
        : { type: "paragraph", lines: lines.map(parseLegalInline) },
    );
}

/** True when any block still carries a [PLACEHOLDER: …] marker. */
export function hasPlaceholder(blocks: LegalBlock[]): boolean {
  return blocks.some((block) =>
    (block.type === "list" ? block.items : block.lines).some((line) =>
      line.some((part) => part.kind === "placeholder"),
    ),
  );
}

/**
 * Fills `{name}`-style arguments in a legal body. The bodies are read raw from
 * the catalogue (they are long prose, not ICU messages with plural rules), so
 * only plain arguments are supported; unknown ones are left as written.
 */
export function fillLegalValues(
  text: string,
  values: Readonly<Record<string, string>>,
): string {
  return text.replace(/\{([A-Za-z_]\w*)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole,
  );
}
