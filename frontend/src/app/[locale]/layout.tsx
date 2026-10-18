import { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isSupportedLocale } from "@/lib/i18n/config";
import { HtmlLangSync } from "@/components/layout/html-lang-sync";

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  return (
    <>
      <HtmlLangSync locale={locale} />
      {children}
    </>
  );
}
