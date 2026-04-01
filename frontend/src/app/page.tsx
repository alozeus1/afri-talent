import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, normalizeLocale } from "@/lib/i18n/config";

const LOCALE_COOKIE = "afritalent-locale";

export default async function RootPage() {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isSupportedLocale(cookieLocale)
    ? cookieLocale
    : normalizeLocale(headerStore.get("accept-language")) || DEFAULT_LOCALE;

  redirect(`/${locale}`);
}
