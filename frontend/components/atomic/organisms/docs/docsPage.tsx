import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Info } from "lucide-react";
import { getMessages, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/atomic/molecules/investments/PageHeader";
import {
  DOC_PAGES,
  DOC_ROUTES,
  DOC_SECTION_LINKS,
  type DocPage,
  type DocSectionPage,
} from "@/lib/config/docs";
import {
  fillLegalValues,
  parseLegalBlocks,
  type LegalBlock,
  type LegalLine,
} from "@/../services/legal/legalText";

/** One section of a docs page as it sits in messages/<lang>/docs.json. */
interface DocSection {
  title: string;
  body: string;
  /** Tutorials: the steps, one "- " line each, rendered as a numbered list */
  steps?: string;
  /** A tip or caveat shown after the steps */
  note?: string;
  /** Label of the link to DOC_SECTION_LINKS[page][key] */
  linkLabel?: string;
}

export async function docsMetadata(page: DocPage): Promise<Metadata> {
  const tNav = await getTranslations("navigation.sidebar.items");
  const t = await getTranslations("docs");
  return {
    title: t("meta.title", { page: tNav(page) }),
    description: t(`${page}.subtitle`),
  };
}

/**
 * A page of the in-app docs (/docs/*, signed-in). Section pages render their
 * sections from the "docs" catalogue in catalogue order; the bodies are plain
 * text in the same format as the legal pages (services/legal/legalText.ts).
 * The changelog passes its own content as children.
 */
export async function DocsPage({
  page,
  values = {},
  extras = {},
  showContents = false,
  children,
}: {
  page: DocPage;
  /** `{name}` arguments the section bodies may use */
  values?: Readonly<Record<string, string>>;
  /** Content shown at the end of a section, by section key */
  extras?: Readonly<Record<string, ReactNode>>;
  /** Show an "On this page" list of the sections */
  showContents?: boolean;
  children?: ReactNode;
}) {
  const tNav = await getTranslations("navigation.sidebar.items");
  const t = await getTranslations("docs");
  const sections =
    page === "changelog" ? [] : await readSections(page, values);

  return (
    <div className="flex flex-col gap-8 pb-10 max-w-3xl">
      <PageHeader title={tNav(page)} subtitle={t(`${page}.subtitle`)} />

      {showContents && sections.length > 0 && (
        <nav
          aria-label={t("nav.onThisPage")}
          className="rounded-lg border p-4"
        >
          <p className="text-sm font-medium">{t("nav.onThisPage")}</p>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {sections.map((section) => (
              <li key={section.key}>
                <a
                  href={`#${section.key}`}
                  className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {sections.map((section) => (
        <section
          key={section.key}
          id={section.key}
          className="scroll-mt-20 space-y-3 leading-relaxed"
        >
          <h2 className="text-xl font-semibold">{section.title}</h2>
          <DocsBlocks blocks={section.body} />
          {section.steps.length > 0 && <DocsBlocks blocks={section.steps} numbered />}
          {section.note.length > 0 && (
            <div className="bg-muted/50 flex gap-3 rounded-md border px-4 py-3 text-sm">
              <Info className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-2">
                <DocsBlocks blocks={section.note} />
              </div>
            </div>
          )}
          {extras[section.key]}
          {section.link && (
            <Link
              href={section.link.href}
              className="text-primary inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            >
              {section.link.label}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
        </section>
      ))}

      {children}

      <DocsPager
        page={page}
        titles={Object.fromEntries(DOC_PAGES.map((p) => [p, tNav(p)])) as Record<DocPage, string>}
        labels={{
          nav: t("nav.label"),
          previous: t("nav.previous"),
          next: t("nav.next"),
        }}
      />
    </div>
  );
}

async function readSections(
  page: DocSectionPage,
  values: Readonly<Record<string, string>>,
) {
  // Long prose read whole from the catalogue, in its order
  const raw: Record<string, DocSection> = (await getMessages()).docs[page].sections;
  const links: Partial<Record<string, string>> = DOC_SECTION_LINKS[page];
  const parse = (text: string | undefined) =>
    text ? parseLegalBlocks(fillLegalValues(text, values)) : [];
  return Object.entries(raw).map(([key, section]) => {
    const href = links[key];
    return {
      key,
      title: section.title,
      body: parse(section.body),
      steps: parse(section.steps),
      note: parse(section.note),
      link:
        href && section.linkLabel ? { href, label: section.linkLabel } : null,
    };
  });
}

/** Previous / next page in reading order. */
function DocsPager({
  page,
  titles,
  labels,
}: {
  page: DocPage;
  titles: Record<DocPage, string>;
  labels: { nav: string; previous: string; next: string };
}) {
  const index = DOC_PAGES.indexOf(page);
  const previous = index > 0 ? DOC_PAGES[index - 1] : null;
  const next = index < DOC_PAGES.length - 1 ? DOC_PAGES[index + 1] : null;
  return (
    <nav
      aria-label={labels.nav}
      className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:justify-between"
    >
      {previous ? (
        <Link
          href={DOC_ROUTES[previous]}
          className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>
            <span className="text-muted-foreground block text-xs">
              {labels.previous}
            </span>
            {titles[previous]}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          href={DOC_ROUTES[next]}
          className="hover:bg-muted/50 flex items-center justify-end gap-3 rounded-lg border px-4 py-3 text-right text-sm"
        >
          <span>
            <span className="text-muted-foreground block text-xs">
              {labels.next}
            </span>
            {titles[next]}
          </span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </nav>
  );
}

function DocsBlocks({
  blocks,
  numbered = false,
}: {
  blocks: LegalBlock[];
  /** Render lists as numbered steps */
  numbered?: boolean;
}) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === "list") {
          const items = block.items.map((item, j) => (
            <li key={j}>
              <DocsLine line={item} />
            </li>
          ));
          return numbered ? (
            <ol key={i} className="list-decimal space-y-1.5 pl-6">
              {items}
            </ol>
          ) : (
            <ul key={i} className="list-disc space-y-1 pl-6">
              {items}
            </ul>
          );
        }
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <DocsLine line={line} />
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

function DocsLine({ line }: { line: LegalLine }) {
  return (
    <>
      {line.map((part, i) =>
        part.kind === "link" ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 break-words"
          >
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
