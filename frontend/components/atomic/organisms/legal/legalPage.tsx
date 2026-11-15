import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getFormatter, getMessages, getTranslations } from "next-intl/server";

import { SiteFooter } from "@/components/atomic/organisms/siteFooter";
import { LEGAL_LAST_UPDATED, LEGAL_OPERATOR } from "@/lib/config/legal";
import {
  fillLegalValues,
  hasPlaceholder,
  parseLegalBlocks,
  type LegalBlock,
  type LegalLine,
} from "@/../services/legal/legalText";

/** The public legal pages; each is a namespace under "legal" in the catalogue. */
export type LegalPageKey = "privacy" | "terms" | "impressum";

type LegalSections = Record<string, { title: string; body: string }>;

/** Values the legal bodies may reference, e.g. "{email}". */
function operatorValues(country: string): Record<string, string> {
  return {
    name: LEGAL_OPERATOR.name,
    street: LEGAL_OPERATOR.street,
    postalCode: LEGAL_OPERATOR.postalCode,
    city: LEGAL_OPERATOR.city,
    country,
    email: LEGAL_OPERATOR.email,
    phone: LEGAL_OPERATOR.phone,
    vatId: LEGAL_OPERATOR.vatId,
  };
}

export async function legalMetadata(page: LegalPageKey): Promise<Metadata> {
  const t = await getTranslations("legal");
  return {
    title: t(`${page}.metaTitle`),
    description: t(`${page}.metaDescription`),
  };
}

/**
 * A public legal page (/privacy, /terms, /impressum) rendered from the
 * "legal" catalogue: the landing page's dark look, a way back home, the
 * sections in catalogue order and the footer. Public in proxy.ts.
 */
export async function LegalPage({
  page,
  showLastUpdated = true,
}: {
  page: LegalPageKey;
  showLastUpdated?: boolean;
}) {
  const t = await getTranslations("legal");
  const format = await getFormatter();
  // Section bodies are long prose read whole from the catalogue, in its order
  const sections: LegalSections = (await getMessages()).legal[page].sections;
  const values = operatorValues(t("common.country"));
  const rendered = Object.entries(sections).map(([key, section]) => ({
    key,
    title: section.title,
    blocks: parseLegalBlocks(fillLegalValues(section.body, values)),
  }));
  const incomplete = rendered.some((section) => hasPlaceholder(section.blocks));
  const placeholderLabel = (text: string) => t("common.placeholder", { text });

  return (
    <div className="min-h-screen bg-[#050505] text-white/70">
      <header className="border-b border-white/[0.05]">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/fiscalisIcon.svg"
              alt="Fiscalis"
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="text-lg font-bold text-white">Fiscalis</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" />
            {t("common.home")}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-white mb-2">
          {t(`${page}.title`)}
        </h1>
        {showLastUpdated && (
          <p className="text-sm text-white/40">
            {t("common.lastUpdated", {
              date: format.dateTime(LEGAL_LAST_UPDATED, { dateStyle: "long" }),
            })}
          </p>
        )}
        {incomplete && (
          <p className="mt-6 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            {t("common.placeholderNotice")}
          </p>
        )}
        <div className="mt-10 space-y-10 leading-relaxed">
          {rendered.map((section) => (
            <section key={section.key} className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                {section.title}
              </h2>
              {section.blocks.map((block, i) => (
                <LegalBlockView
                  key={i}
                  block={block}
                  placeholderLabel={placeholderLabel}
                />
              ))}
            </section>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function LegalBlockView({
  block,
  placeholderLabel,
}: {
  block: LegalBlock;
  placeholderLabel: (text: string) => string;
}) {
  if (block.type === "list") {
    return (
      <ul className="list-disc ps-6 space-y-1">
        {block.items.map((item, i) => (
          <li key={i}>
            <LegalLineView line={item} placeholderLabel={placeholderLabel} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p>
      {block.lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          <LegalLineView line={line} placeholderLabel={placeholderLabel} />
        </span>
      ))}
    </p>
  );
}

function LegalLineView({
  line,
  placeholderLabel,
}: {
  line: LegalLine;
  placeholderLabel: (text: string) => string;
}) {
  return (
    <>
      {line.map((part, i) => {
        if (part.kind === "link") {
          const external = part.href.startsWith("https://");
          return (
            <a
              key={i}
              href={part.href}
              {...(external && { target: "_blank", rel: "noopener noreferrer" })}
              className="text-[#D4AF37] hover:text-[#F4CF57] underline underline-offset-2 break-words"
            >
              {part.text}
            </a>
          );
        }
        if (part.kind === "placeholder") {
          // Visible on purpose: the page must not go live with a silent gap.
          return (
            <mark key={i} className="bg-amber-400/20 text-amber-300 px-1 rounded">
              [{placeholderLabel(part.text)}]
            </mark>
          );
        }
        return <span key={i}>{part.text}</span>;
      })}
    </>
  );
}
