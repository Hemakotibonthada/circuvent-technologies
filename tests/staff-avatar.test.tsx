/**
 * The operator's face in the admin topbar.
 *
 * This existed as initials only, which is what the bug looked like: staff with
 * a photo at auth.circuvent.com still saw two letters. The assertions that
 * matter are the fallbacks, because a picture URL owned by someone else is a
 * thing that fails in production and not on anybody's machine.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import StaffAvatar, { initialsFor } from "@/app/smarthome/admin/StaffAvatar";

describe("initialsFor", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsFor("Platform Admin", "")).toBe("PA");
    expect(initialsFor("Hema Koteswar Naidu", "")).toBe("HK");
  });

  it("uses two letters when there is only one word", () => {
    expect(initialsFor("Hema", "")).toBe("HE");
  });

  /*
   * Falling back to the email is what stops the badge going blank for accounts
   * the directory gave no display name — which is most machine-provisioned
   * ones. "the.vema@icloud.com" reading as "TV" is better than an empty box.
   */
  it("falls back to the email when there is no name", () => {
    expect(initialsFor("", "the.vema@icloud.com")).toBe("TV");
    expect(initialsFor("   ", "ada@circuvent.com")).toBe("AD");
  });

  it("never renders empty", () => {
    expect(initialsFor("", "")).toBe("?");
  });
});

describe("StaffAvatar", () => {
  it("shows the directory photo when there is one", () => {
    render(<StaffAvatar name="Platform Admin" email="a@b.com" photo="https://auth.circuvent.com/u/1.jpg" />);
    const img = screen.getByRole("presentation", { hidden: true }) as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
    expect(img.src).toBe("https://auth.circuvent.com/u/1.jpg");
    expect(screen.queryByText("PA")).not.toBeInTheDocument();
  });

  it("shows initials when the directory asserted no photo", () => {
    render(<StaffAvatar name="Platform Admin" email="a@b.com" />);
    expect(screen.getByText("PA")).toBeInTheDocument();
  });

  /*
   * The regression this file is really for. A directory photo that 404s used to
   * leave a broken-image glyph where the operator's identity should be; the
   * failed load has to fall back to initials rather than to nothing.
   */
  it("falls back to initials when the photo fails to load", () => {
    render(<StaffAvatar name="Platform Admin" email="a@b.com" photo="https://auth.circuvent.com/gone.jpg" />);
    fireEvent.error(screen.getByRole("presentation", { hidden: true }));
    expect(screen.getByText("PA")).toBeInTheDocument();
  });

  it("does not send a referrer, so hotlink-protected photos still load", () => {
    render(<StaffAvatar name="A B" photo="https://auth.circuvent.com/u/1.jpg" />);
    expect(screen.getByRole("presentation", { hidden: true })).toHaveAttribute("referrerpolicy", "no-referrer");
  });
});
