import { fireEvent, render, screen, waitFor } from "@testing-library/react";

let mockLocale = "en";
let mockPathname = "/admin/security";
const fetchAPIMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => mockPathname,
}));

jest.mock("@/lib/i18n/client", () => ({
  useLocale: () => mockLocale,
  localizePath: (path: string) => path,
}));

jest.mock("@/lib/api", () => ({
  fetchAPI: (...args: unknown[]) => fetchAPIMock(...args),
}));

import AdminSecurityPage from "../security/page";
import { TotpBanner, TotpRequiredNotice } from "@/components/admin/totp-notice";
import { ADMIN_TOTP_CHANGED_EVENT } from "@/lib/admin-console-api";

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const URI = `otpauth://totp/AfriTalent:admin%40afritalent.com?secret=${SECRET}&issuer=AfriTalent`;
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function apiError(status: number, code?: string) {
  return Object.assign(new Error("server text that must not be shown"), { status, code });
}

type Routes = Record<string, (options?: { method?: string; body?: string }) => unknown>;

function routeApi(routes: Routes) {
  fetchAPIMock.mockImplementation(async (endpoint: string, options?: { method?: string; body?: string }) => {
    const handler = routes[endpoint];
    if (!handler) throw new Error(`unexpected call ${endpoint}`);
    return handler(options);
  });
}

const notEnrolled = (graceUntil: string | null = FUTURE, pending = false) => ({
  enrolled: false,
  enrolmentStartedAt: pending ? "pending" : null,
  graceUntil,
  isAdmin: true,
});

beforeEach(() => {
  mockLocale = "en";
  mockPathname = "/admin/security";
  fetchAPIMock.mockReset();
});

describe("admin security page", () => {
  it("walks through enrolment: status, QR + secret, code verification, success", async () => {
    const changed = jest.fn();
    window.addEventListener(ADMIN_TOTP_CHANGED_EVENT, changed);
    let verifyCalls = 0;
    routeApi({
      "/api/admin/totp/status": () => notEnrolled(),
      "/api/admin/totp/enrol": () => ({ secret: SECRET, provisioningUri: URI, instructions: "x" }),
      "/api/admin/totp/verify-enrolment": (options) => {
        verifyCalls += 1;
        if (verifyCalls === 1) throw apiError(400, "TOTP_INVALID_CODE");
        expect(JSON.parse(options?.body ?? "{}")).toEqual({ code: "654321" });
        return { enrolled: true, enrolledAt: new Date().toISOString() };
      },
    });

    render(<AdminSecurityPage />);

    expect(await screen.findByText("Two-factor authentication is off")).toBeInTheDocument();
    expect(screen.getByText(/Your grace period ends/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Set up two-factor" }));

    expect(await screen.findByRole("img", { name: "QR code for your authenticator app" })).toBeInTheDocument();
    expect(document.querySelector("svg")).not.toBeNull();
    expect(screen.getByTestId("totp-secret")).toHaveTextContent("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP");
    expect(fetchAPIMock).toHaveBeenCalledWith("/api/admin/totp/enrol", { method: "POST" });

    const input = screen.getByLabelText("6-digit code");

    // Client-side format check: no request for an incomplete code.
    fireEvent.change(input, { target: { value: "12a3" } });
    expect(input).toHaveValue("123");
    fireEvent.click(screen.getByRole("button", { name: "Verify and turn on" }));
    expect(await screen.findByText("Enter the 6 digits from your authenticator app.")).toBeInTheDocument();
    expect(verifyCalls).toBe(0);

    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and turn on" }));
    expect(await screen.findByText(/That code didn’t work/)).toBeInTheDocument();
    expect(screen.queryByText("server text that must not be shown")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and turn on" }));

    expect(await screen.findByRole("heading", { name: "Two-factor authentication is on" })).toBeInTheDocument();
    expect(screen.queryByTestId("totp-secret")).not.toBeInTheDocument();
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener(ADMIN_TOTP_CHANGED_EVENT, changed);
  });

  it("returns to the status view when the server has no enrolment in progress", async () => {
    routeApi({
      "/api/admin/totp/status": () => notEnrolled(FUTURE, true),
      "/api/admin/totp/enrol": () => ({ secret: SECRET, provisioningUri: URI, instructions: "x" }),
      "/api/admin/totp/verify-enrolment": () => {
        throw apiError(409, "TOTP_NOT_STARTED");
      },
    });

    render(<AdminSecurityPage />);
    expect(await screen.findByText(/You started setting up two-factor/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start setup again" }));
    fireEvent.change(await screen.findByLabelText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and turn on" }));

    expect(await screen.findByText("Your setup session has expired. Start setup again.")).toBeInTheDocument();
    expect(screen.queryByTestId("totp-secret")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start setup again" })).toBeInTheDocument();
  });

  it("explains an expired grace period", async () => {
    routeApi({ "/api/admin/totp/status": () => notEnrolled(PAST) });
    render(<AdminSecurityPage />);
    expect(
      await screen.findByText("Your grace period has ended. Set up two-factor now to unlock the admin console."),
    ).toBeInTheDocument();
  });

  it("shows the enrolled state with a turn-off form", async () => {
    routeApi({
      "/api/admin/totp/status": () => ({ enrolled: true, enrolmentStartedAt: "pending", graceUntil: null, isAdmin: true }),
      "/api/admin/totp/disable": () => {
        throw apiError(400, "TOTP_INVALID_CODE");
      },
    });
    render(<AdminSecurityPage />);
    expect(await screen.findByRole("heading", { name: "Two-factor authentication is on" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(await screen.findByText(/That code didn’t work/)).toBeInTheDocument();
  });

  it("maps a failed status load to friendly copy", async () => {
    routeApi({
      "/api/admin/totp/status": () => {
        throw apiError(401);
      },
    });
    render(<AdminSecurityPage />);
    expect(await screen.findByText("Your session has expired. Sign in again to continue.")).toBeInTheDocument();
  });

  it("handles an already-enrolled conflict when starting setup", async () => {
    let statusCalls = 0;
    routeApi({
      "/api/admin/totp/status": () => {
        statusCalls += 1;
        return statusCalls === 1 ? notEnrolled() : { enrolled: true, enrolmentStartedAt: "pending", graceUntil: null, isAdmin: true };
      },
      "/api/admin/totp/enrol": () => {
        throw apiError(409, "TOTP_ALREADY_ENROLLED");
      },
    });
    render(<AdminSecurityPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up two-factor" }));
    expect(await screen.findByText("Two-factor authentication is already on for your account.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Two-factor authentication is on" })).toBeInTheDocument();
  });

  it("renders in Arabic", async () => {
    mockLocale = "ar";
    routeApi({ "/api/admin/totp/status": () => notEnrolled() });
    render(<AdminSecurityPage />);
    expect(await screen.findByRole("heading", { name: "المصادقة الثنائية" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "إعداد المصادقة الثنائية" })).toBeInTheDocument();
  });
});

describe("admin TOTP banner", () => {
  it("prompts un-enrolled admins with a link to the security page", async () => {
    mockPathname = "/fr/admin/users";
    mockLocale = "fr";
    routeApi({ "/api/admin/totp/status": () => notEnrolled() });
    render(<TotpBanner />);
    expect(await screen.findByText("Configurez l’authentification à deux facteurs")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurer maintenant" })).toHaveAttribute("href", "/fr/admin/security");
  });

  it("says the console is locked once grace has ended", async () => {
    mockPathname = "/admin";
    routeApi({ "/api/admin/totp/status": () => notEnrolled(null) });
    render(<TotpBanner />);
    expect(await screen.findByText(/Your grace period has ended. The admin console is locked/)).toBeInTheDocument();
  });

  it("stays hidden for enrolled admins and refreshes on change events", async () => {
    mockPathname = "/admin";
    let enrolled = false;
    routeApi({
      "/api/admin/totp/status": () => (enrolled ? { enrolled: true, enrolmentStartedAt: "pending", graceUntil: null, isAdmin: true } : notEnrolled()),
    });
    render(<TotpBanner />);
    expect(await screen.findByTestId("admin-totp-banner")).toBeInTheDocument();
    enrolled = true;
    window.dispatchEvent(new Event(ADMIN_TOTP_CHANGED_EVENT));
    await waitFor(() => expect(screen.queryByTestId("admin-totp-banner")).not.toBeInTheDocument());
  });
});

describe("TOTP required notice", () => {
  it("links blocked admins to the setup page", () => {
    mockPathname = "/admin";
    render(<TotpRequiredNotice />);
    expect(screen.getByText("Two-factor setup required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set up two-factor" })).toHaveAttribute("href", "/admin/security");
  });
});
