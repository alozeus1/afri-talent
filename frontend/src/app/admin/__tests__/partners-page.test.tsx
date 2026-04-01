import { render, screen, waitFor } from "@testing-library/react";
import AdminPartnersPage from "../partners/page";

const push = jest.fn();
const listMock = jest.fn();
const detailMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: {
      id: "admin-user",
      role: "ADMIN",
      name: "Admin User",
      email: "admin@afritalent.com",
    },
    isLoading: false,
  }),
}));

jest.mock("@/lib/i18n/client", () => ({
  useLocale: () => "en",
  localizePath: (path: string) => path,
}));

jest.mock("@/lib/api", () => ({
  adminPartners: {
    list: (...args: unknown[]) => listMock(...args),
    detail: (...args: unknown[]) => detailMock(...args),
    create: jest.fn(),
    issueMarker: jest.fn(),
    issueVerifiedSkill: jest.fn(),
  },
}));

describe("AdminPartnersPage", () => {
  beforeEach(() => {
    push.mockReset();
    listMock.mockReset();
    detailMock.mockReset();

    listMock.mockResolvedValue({
      partners: [
        {
          id: "partner-1",
          externalId: "uni-lagos",
          name: "University of Lagos",
          organizationType: "UNIVERSITY",
          country: "NG",
          website: "https://unilag.edu.ng",
          status: "ACTIVE",
          createdAt: "2026-03-28T00:00:00.000Z",
          updatedAt: "2026-03-28T00:00:00.000Z",
          _count: {
            records: 3,
            verifiedSkills: 2,
            partnerMarkers: 1,
          },
        },
      ],
    });

    detailMock.mockResolvedValue({
      partner: {
        id: "partner-1",
        externalId: "uni-lagos",
        name: "University of Lagos",
        organizationType: "UNIVERSITY",
        country: "NG",
        website: "https://unilag.edu.ng",
        status: "ACTIVE",
        createdAt: "2026-03-28T00:00:00.000Z",
        updatedAt: "2026-03-28T00:00:00.000Z",
      },
      records: [],
      issuedSkills: [],
      issuedMarkers: [],
    });
  });

  it("loads and renders partner operations content", async () => {
    render(<AdminPartnersPage />);

    expect(await screen.findByText("Institution and training trust tooling")).toBeInTheDocument();

    await waitFor(() => {
      expect(listMock).toHaveBeenCalled();
    });

    expect(await screen.findByText("University of Lagos")).toBeInTheDocument();

    await waitFor(() => {
      expect(detailMock).toHaveBeenCalledWith("partner-1");
    });
  });
});
