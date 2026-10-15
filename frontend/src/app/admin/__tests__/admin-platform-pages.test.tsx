import { fireEvent, render, screen, waitFor } from "@testing-library/react";

let mockLocale = "en";
const fetchAPIMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/admin",
}));

jest.mock("@/lib/i18n/client", () => ({
  useLocale: () => mockLocale,
  localizePath: (path: string) => path,
}));

jest.mock("@/lib/api", () => ({
  fetchAPI: (...args: unknown[]) => fetchAPIMock(...args),
}));

jest.mock("@/lib/api/support", () => ({
  adminReviews: { moderate: jest.fn() },
}));

import AuditLogsPage from "../audit-logs/page";
import BulkPage from "../bulk/page";
import AdminReviewsPage from "../reviews/page";

beforeEach(() => {
  mockLocale = "en";
  fetchAPIMock.mockReset();
});

describe("admin platform pages", () => {
  it("renders the reviews queue in French with translated statuses", async () => {
    mockLocale = "fr";
    fetchAPIMock.mockResolvedValue({
      reviews: [
        {
          id: "r1",
          companyName: "Andela",
          reviewerName: "Ada",
          rating: 4,
          title: "Great team",
          pros: "Mentors",
          cons: "Pace",
          approved: false,
          moderationStatus: "PENDING",
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    render(<AdminReviewsPage />);

    expect(screen.getByRole("heading", { name: "Avis sur les entreprises" })).toBeInTheDocument();
    expect(await screen.findByText("Andela")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approuver" })).toBeInTheDocument();
    expect(fetchAPIMock).toHaveBeenCalledWith("/api/admin/reviews?page=1&status=pending");
  });

  it("labels audit actions in the active language and filters by action", async () => {
    mockLocale = "pt";
    fetchAPIMock.mockResolvedValue({
      logs: [
        {
          id: "l1",
          action: "USER_SUSPENDED",
          admin: { id: "a1", title: "Ops", email: "ops@afritalent.com", name: "Ops Admin" },
          target: { type: "USER", id: "u1", name: "Ada" },
          changes: null,
          reason: "Spam",
          status: "SUCCESS",
          timestamp: "2026-09-01T00:00:00.000Z",
          ipAddress: null,
        },
      ],
      pagination: { page: 1, limit: 50, total: 1, pages: 1 },
    });

    render(<AuditLogsPage />);

    expect(await screen.findAllByText("Usuário suspenso")).not.toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Ação"), { target: { value: "JOB_APPROVED" } });
    await waitFor(() => expect(fetchAPIMock).toHaveBeenLastCalledWith(expect.stringContaining("action=JOB_APPROVED")));
  });

  it("rejects invalid JSON filters before calling the bulk API", async () => {
    fetchAPIMock.mockResolvedValue({ operations: [] });
    render(<BulkPage />);
    await screen.findByText("No operations yet");

    fireEvent.change(screen.getByLabelText("Filters (JSON)"), { target: { value: "{not json" } });
    fireEvent.click(screen.getByRole("button", { name: "Run operation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Filters must be valid JSON.");
    expect(fetchAPIMock).not.toHaveBeenCalledWith("/api/admin/bulk", expect.anything());
  });
});
