import { describe, it, expect } from "vitest";
import { isBlockedIp, assertPublicHttpUrl, SsrfError } from "../../lib/security/ssrf.js";

describe("isBlockedIp", () => {
  it("blocks IPv4 loopback, private, link-local, and metadata ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "127.1.2.3",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "224.0.0.1", // multicast
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("allows public IPv4 addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it("blocks IPv6 loopback, link-local, ULA, and IPv4-mapped private", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("allows public IPv6 addresses", () => {
    expect(isBlockedIp("2606:4700:4700::1111")).toBe(false);
  });

  it("blocks anything that is not a valid IP", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
  });
});

describe("assertPublicHttpUrl", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(assertPublicHttpUrl("ftp://example.com/x")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicHttpUrl("gopher://example.com")).rejects.toBeInstanceOf(SsrfError);
  });

  it("rejects internal hostnames without needing DNS", async () => {
    await expect(assertPublicHttpUrl("http://localhost/admin")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicHttpUrl("http://db.internal/")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicHttpUrl("http://foo.local/")).rejects.toBeInstanceOf(SsrfError);
  });

  it("rejects private/metadata IP literals", async () => {
    await expect(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicHttpUrl("http://127.0.0.1:4000/")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicHttpUrl("http://10.0.0.1/")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicHttpUrl("http://[::1]/")).rejects.toBeInstanceOf(SsrfError);
  });

  it("accepts a public IP literal URL", async () => {
    await expect(assertPublicHttpUrl("http://8.8.8.8/robots.txt")).resolves.toBeInstanceOf(URL);
  });

  it("rejects malformed URLs", async () => {
    await expect(assertPublicHttpUrl("http://")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicHttpUrl("not a url")).rejects.toBeInstanceOf(SsrfError);
  });
});
