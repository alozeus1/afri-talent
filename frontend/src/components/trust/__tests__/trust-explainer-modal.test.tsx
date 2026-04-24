import { fireEvent, render, screen } from "@testing-library/react";
import { TrustExplainerModal } from "../trust-explainer-modal";

describe("TrustExplainerModal", () => {
  it("opens and shows trust explanation details", () => {
    render(
      <TrustExplainerModal
        title="Why this profile is trusted"
        description="Multiple signals support this badge."
        items={[
          {
            title: "Phone verification",
            description: "A verified phone signal is on file.",
            statusLabel: "Verified",
            statusVariant: "success",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Why this is trusted" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Why this profile is trusted")).toBeInTheDocument();
    expect(screen.getByText("Phone verification")).toBeInTheDocument();
    expect(screen.getByText("A verified phone signal is on file.")).toBeInTheDocument();
  });

  it("closes when escape is pressed", () => {
    render(
      <TrustExplainerModal
        title="Why this job is trusted"
        description="A few trusted signals are visible."
        items={[{ title: "Company reviewed", description: "The employer passed review." }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Why this is trusted" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
