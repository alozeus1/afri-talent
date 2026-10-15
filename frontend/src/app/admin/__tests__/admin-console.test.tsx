import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ADMIN_MESSAGES, formatAdminMessage } from "@/lib/i18n/admin-messages";

const push = jest.fn();
const usersMock = jest.fn();
const userMock = jest.fn();
const lifecycleMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/users",
}));

jest.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "admin-1", role: "ADMIN", name: "Admin", email: "admin@afritalent.com" },
    isLoading: false,
  }),
}));

jest.mock("@/lib/api", () => ({
  admin: { updateUserRole: jest.fn() },
}));

jest.mock("@/lib/admin-console-api", () => ({
  adminConsole: {
    users: (...args: unknown[]) => usersMock(...args),
    user: (...args: unknown[]) => userMock(...args),
    lifecycle: (...args: unknown[]) => lifecycleMock(...args),
    message: jest.fn(),
    broadcast: jest.fn(),
  },
}));

const candidate = {
  id: "cand-1",
  email: "ada@example.com",
  name: "Ada Lovelace",
  role: "CANDIDATE",
  avatarUrl: null,
  emailVerified: true,
  phoneVerifiedAt: null,
  accountRestrictionStatus: "ACTIVE",
  accountRestrictionReason: null,
  accountRestrictedAt: null,
  accountRestrictedUntil: null,
  sessionsRevokedAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  employer: null,
  candidateTrustProfile: null,
  _count: { applications: 2, sentMessages: 0 },
};

describe("admin console i18n", () => {
  it("ships every key, non-empty, in all five locales", () => {
    const keys = Object.keys(ADMIN_MESSAGES.en);
    for (const locale of ["fr", "es", "pt", "ar"] as const) {
      const dict = ADMIN_MESSAGES[locale] as Record<string, string>;
      for (const key of keys) {
        expect(dict[key]?.trim().length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("interpolates variables", () => {
    expect(formatAdminMessage("Page {page} of {total}", { page: 2, total: 5 })).toBe("Page 2 of 5");
  });
});

describe("admin users page", () => {
  let AdminUsersPage: typeof import("../users/page").default;

  beforeAll(async () => {
    AdminUsersPage = (await import("../users/page")).default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    usersMock.mockResolvedValue({
      users: [candidate],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    });
    userMock.mockResolvedValue({
      user: {
        ...candidate,
        preferredLocale: "EN",
        emailVerifiedAt: "2026-09-02T00:00:00.000Z",
        phoneNumber: null,
        deletionRequestedAt: null,
        totpEnrolledAt: null,
        candidateProfile: null,
        subscription: null,
        adminRole: null,
        _count: { applications: 2, sentMessages: 0, companyReviews: 0, savedSearches: 0, notifications: 0, abuseReportsAgainst: 0 },
      },
      applications: [],
      jobs: [],
      trust: { openReportsAgainst: 0 },
      activity: [{ at: "2026-09-01T00:00:00.000Z", kind: "ACCOUNT_CREATED", label: "Account created" }],
      auditTrail: [],
    });
    lifecycleMock.mockResolvedValue({ user: { ...candidate, accountRestrictionStatus: "SUSPENDED" }, action: "suspend" });
  });

  it("lists users and suspends one with a required reason", async () => {
    render(<AdminUsersPage />);

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ada Lovelace"));

    const suspend = await screen.findByRole("button", { name: "Suspend" });
    fireEvent.click(suspend);

    const dialog = await screen.findByRole("dialog", { name: /Suspend: ada@example.com/ });
    const confirmButton = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Suspend")!;

    // Reason is required — confirming empty shows a validation error and no API call.
    fireEvent.click(confirmButton);
    expect(await screen.findByText("Enter a reason of at least 3 characters.")).toBeInTheDocument();
    expect(lifecycleMock).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Fraud signals" } });
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(lifecycleMock).toHaveBeenCalledWith("cand-1", { action: "suspend", reason: "Fraud signals", until: null }),
    );
  });
});
