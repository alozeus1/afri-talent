/** Validate an externally hosted CV link without treating it as managed storage. */
export function isSafeExternalHttpsUrl(value: string, allowedDomains: string[] = []): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hostname.length === 0) return false;
    const hostname = url.hostname.toLowerCase();
    return allowedDomains.length === 0 || allowedDomains.some((domain) => {
      const normalized = domain.trim().toLowerCase().replace(/^\.+/, "");
      return normalized.length > 0 && (hostname === normalized || hostname.endsWith(`.${normalized}`));
    });
  } catch {
    return false;
  }
}
