import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { CONTACT_MAILTO } from "@/lib/config/legal";

const linkClass = "hover:text-white transition-colors";

/**
 * Footer of the public pages (landing page and legal pages): brand, the legal
 * links and the contact address from the Impressum.
 */
export function SiteFooter() {
  const t = useTranslations("legal.footer");
  return (
    <footer className="relative py-12 px-4 border-t border-white/[0.05]">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4AF37]/20 to-[#D4AF37]/5 border border-[#D4AF37]/30 flex items-center justify-center p-1.5">
              <Image
                src="/fiscalisIcon.svg"
                alt="Fiscalis"
                width={28}
                height={28}
                className="object-contain"
              />
            </div>
            <span className="text-lg font-bold text-white">Fiscalis</span>
          </Link>

          <nav
            aria-label={t("label")}
            className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-white/40"
          >
            <Link href="/privacy" className={linkClass}>
              {t("privacy")}
            </Link>
            <Link href="/terms" className={linkClass}>
              {t("terms")}
            </Link>
            <Link href="/impressum" className={linkClass}>
              {t("impressum")}
            </Link>
            <a href={CONTACT_MAILTO} className={linkClass}>
              {t("contact")}
            </a>
          </nav>

          <p className="text-sm text-white/30">
            {t("copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
  );
}
