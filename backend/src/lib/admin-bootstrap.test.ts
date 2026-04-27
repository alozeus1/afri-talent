import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  compare: vi.fn(),
  hash: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("./prisma.js", () => ({
  default: {
    user: {
      findUnique: mocks.findUnique,
      create: mocks.create,
      update: mocks.update,
    },
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    compare: mocks.compare,
    hash: mocks.hash,
  },
}));

vi.mock("./logger.js", () => ({
  default: {
    info: mocks.info,
    warn: mocks.warn,
  },
}));

describe("ensureBootstrapAdmin", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.ADMIN_BOOTSTRAP_EMAIL;
    delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
  });

  it("creates the bootstrap admin when missing", async () => {
    process.env.ADMIN_BOOTSTRAP_EMAIL = "alozeus1@gmail.com";
    process.env.ADMIN_BOOTSTRAP_PASSWORD = "goldgate617@";
    mocks.findUnique.mockResolvedValue(null);
    mocks.hash.mockResolvedValue("hashed-password");

    const { ensureBootstrapAdmin } = await import("./admin-bootstrap.js");
    await ensureBootstrapAdmin();

    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "alozeus1@gmail.com",
        password: "hashed-password",
        role: Role.ADMIN,
        emailVerified: true,
      }),
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("updates an existing user to admin and resets the password when needed", async () => {
    process.env.ADMIN_BOOTSTRAP_EMAIL = "alozeus1@gmail.com";
    process.env.ADMIN_BOOTSTRAP_PASSWORD = "goldgate617@";
    mocks.findUnique.mockResolvedValue({
      id: "user-1",
      email: "alozeus1@gmail.com",
      password: "old-hash",
      role: Role.CANDIDATE,
      name: "",
      emailVerified: false,
      emailVerifiedAt: null,
    });
    mocks.compare.mockResolvedValue(false);
    mocks.hash.mockResolvedValue("new-hash");

    const { ensureBootstrapAdmin } = await import("./admin-bootstrap.js");
    await ensureBootstrapAdmin();

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        password: "new-hash",
        role: Role.ADMIN,
        name: "alozeus1",
        emailVerified: true,
      }),
    });
  });
});
