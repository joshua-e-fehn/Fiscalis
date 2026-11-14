import { describe, expect, it } from "vitest";

import {
  fillLegalValues,
  hasPlaceholder, parseLegalBlocks, parseLegalInline } from "./legalText";

describe("parseLegalInline", () => {
  it("keeps plain text as one segment", () => {
    expect(parseLegalInline("Just text.")).toEqual([
      { kind: "text", text: "Just text." },
    ]);
  });

  it("links URLs without trailing punctuation", () => {
    expect(parseLegalInline("See https://plaid.com/legal/.")).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", href: "https://plaid.com/legal/", text: "https://plaid.com/legal/" },
      { kind: "text", text: "." },
    ]);
  });

  it("links e-mail addresses as mailto", () => {
    expect(parseLegalInline("Write to a.b@example.de, please")).toEqual([
      { kind: "text", text: "Write to " },
      { kind: "link", href: "mailto:a.b@example.de", text: "a.b@example.de" },
      { kind: "text", text: ", please" },
    ]);
  });

  it("marks placeholders", () => {
    expect(parseLegalInline("Officer: [PLACEHOLDER: name ] here")).toEqual([
      { kind: "text", text: "Officer: " },
      { kind: "placeholder", text: "name" },
      { kind: "text", text: " here" },
    ]);
  });
});

describe("parseLegalBlocks", () => {
  it("splits paragraphs on blank lines and lists on '- ' lines", () => {
    const blocks = parseLegalBlocks("First line\nsecond line\n\n- one\n- two\n\nEnd");
    expect(blocks).toEqual([
      {
        type: "paragraph",
        lines: [
          [{ kind: "text", text: "First line" }],
          [{ kind: "text", text: "second line" }],
        ],
      },
      {
        type: "list",
        items: [[{ kind: "text", text: "one" }], [{ kind: "text", text: "two" }]],
      },
      { type: "paragraph", lines: [[{ kind: "text", text: "End" }]] },
    ]);
  });

  it("treats a block mixing list and text lines as a paragraph", () => {
    expect(parseLegalBlocks("Intro\n- item")[0].type).toBe("paragraph");
  });

  it("ignores surrounding whitespace and empty input", () => {
    expect(parseLegalBlocks("\n\n  \n")).toEqual([]);
  });

  it("detects placeholders anywhere", () => {
    expect(hasPlaceholder(parseLegalBlocks("a\n\n- b [PLACEHOLDER: c]"))).toBe(true);
    expect(hasPlaceholder(parseLegalBlocks("a\n\n- b"))).toBe(false);
  });
});

describe("fillLegalValues", () => {
  it("replaces known arguments and keeps unknown ones", () => {
    expect(fillLegalValues("{name} at {email} {other}", { name: "A", email: "a@b.de" })).toBe(
      "A at a@b.de {other}",
    );
  });

  it("does not read inherited properties", () => {
    expect(fillLegalValues("{toString}", {})).toBe("{toString}");
  });
});
