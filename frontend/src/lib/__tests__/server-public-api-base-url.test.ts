import { getServerApiBaseUrl } from "../server-public-api";

describe("getServerApiBaseUrl", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("prefers INTERNAL_API_URL on the server, read at call time", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";
    process.env.INTERNAL_API_URL = "http://backend:4000";
    expect(getServerApiBaseUrl(true)).toBe("http://backend:4000");
  });

  it("ignores INTERNAL_API_URL in the browser", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";
    process.env.INTERNAL_API_URL = "http://backend:4000";
    expect(getServerApiBaseUrl(false)).toBe("http://localhost:4000");
    // jsdom defines window, so the default resolves to the browser branch.
    expect(getServerApiBaseUrl()).toBe("http://localhost:4000");
  });

  it("falls back to the public URL when INTERNAL_API_URL is unset (deployed envs)", () => {
    delete process.env.INTERNAL_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    expect(getServerApiBaseUrl(true)).toBe("https://api.example.com");
  });

  it("falls back to localhost when nothing is configured", () => {
    delete process.env.INTERNAL_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    expect(getServerApiBaseUrl(true)).toBe("http://localhost:4000");
  });
});
