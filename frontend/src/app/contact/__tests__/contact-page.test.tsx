import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const createTicket = jest.fn();
const myTickets = jest.fn();
let mockLocale = "en";
let mockUser: { id: string; name: string; email: string; role: string } | null = null;

jest.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, isLoading: false }),
}));

jest.mock("@/lib/i18n/client", () => ({
  useLocale: () => mockLocale,
  localizePath: (path: string, locale: string) => `/${locale}${path}`,
}));

jest.mock("@/lib/api", () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError };
});

jest.mock("@/lib/api/support", () => ({
  SUPPORT_TOPICS: ["GENERAL", "ACCOUNT", "TRUST_SAFETY"],
  support: {
    createTicket: (...args: unknown[]) => createTicket(...args),
    myTickets: (...args: unknown[]) => myTickets(...args),
  },
}));

import ContactPage from "../page";
import { ApiError } from "@/lib/api";

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Amina Okafor" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "amina@example.com" } });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "I cannot verify my email address after signing up yesterday." },
  });
}

describe("ContactPage", () => {
  beforeEach(() => {
    createTicket.mockReset();
    myTickets.mockReset().mockResolvedValue({ tickets: [] });
    mockLocale = "en";
    mockUser = null;
  });

  it("validates required fields before submitting", async () => {
    render(<ContactPage />);
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Please enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Please share a little more detail (at least 20 characters).")).toBeInTheDocument();
    expect(createTicket).not.toHaveBeenCalled();
  });

  it("submits with bot shield + locale and shows the ticket reference", async () => {
    createTicket.mockResolvedValue({ ticket: { id: "t1", reference: "AT-ABC234", status: "OPEN", createdAt: "" } });
    render(<ContactPage />);
    fillValidForm();
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "ACCOUNT" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Message received")).toBeInTheDocument();
    expect(screen.getByText(/AT-ABC234/)).toBeInTheDocument();
    const payload = createTicket.mock.calls[0][0];
    expect(payload).toMatchObject({
      name: "Amina Okafor",
      email: "amina@example.com",
      topic: "ACCOUNT",
      locale: "en",
      botShield: { website: "" },
    });
    expect(typeof payload.botShield.startedAt).toBe("number");
  });

  it("shows a friendly message when rate limited", async () => {
    createTicket.mockRejectedValue(new ApiError("Too many", 429));
    render(<ContactPage />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/sent several messages recently/);
  });

  it("renders in French and prefills a signed-in user", async () => {
    mockLocale = "fr";
    mockUser = { id: "u1", name: "Awa Diop", email: "awa@example.com", role: "CANDIDATE" };
    render(<ContactPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Comment pouvons-nous vous aider ?");
    await waitFor(() => expect(screen.getByLabelText("Nom complet")).toHaveValue("Awa Diop"));
    expect(screen.getByLabelText("Adresse e-mail")).toHaveValue("awa@example.com");
    expect(screen.getByRole("link", { name: /Faire un signalement/ })).toHaveAttribute("href", "/fr/trust/report");
    await waitFor(() => expect(myTickets).toHaveBeenCalled());
  });
});
