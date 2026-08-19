/**
 * The account section rail, rendered.
 *
 * This replaced a scroll-spy: nine sections were rendered down one column and
 * the "tabs" were anchor links that jumped between them, so the page ran to
 * several thousand pixels and reaching Wallet meant scrolling past every order
 * the customer had ever placed. It now selects, and one section is mounted at
 * a time.
 *
 * That swap moves real behaviour into this component — keyboard traversal, the
 * tab order, which step reads as current — none of which a static assertion can
 * check. Hence a rendered test.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LayoutDashboard, Package, Wallet, Heart } from "lucide-react";
import AccountSectionNav, { type AccountSection } from "@/components/shop/AccountSectionNav";

const SECTIONS: AccountSection[] = [
  { id: "account-overview", label: "Overview", icon: LayoutDashboard },
  { id: "account-orders", label: "Orders", icon: Package, badge: "10" },
  { id: "account-wallet", label: "Wallet", icon: Wallet, badge: "₹180" },
  { id: "account-wishlist", label: "Wishlist", icon: Heart },
];

function setup(value = "account-overview") {
  const onChange = jest.fn();
  render(<AccountSectionNav sections={SECTIONS} value={value} onChange={onChange} />);
  return { onChange };
}

/* jsdom implements neither, and the component calls both on selection. */
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
  window.scrollTo = jest.fn();
});

describe("the account rail", () => {
  it("offers every section", () => {
    setup();
    expect(screen.getAllByRole("tab")).toHaveLength(SECTIONS.length);
    for (const s of SECTIONS) expect(screen.getByRole("tab", { name: new RegExp(s.label) })).toBeInTheDocument();
  });

  it("marks exactly one section current", () => {
    setup("account-wallet");
    const selected = screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveAttribute("id", "tab-account-wallet");
  });

  it("points the current tab at the panel it controls", () => {
    // The panel is rendered by the page, so the only thing that can be checked
    // here is that the rail names it — but a wrong name is invisible to sighted
    // users and total to a screen reader.
    setup("account-orders");
    expect(screen.getByRole("tab", { selected: true })).toHaveAttribute("aria-controls", "panel-account-orders");
  });

  it("keeps only the current tab in the tab order", () => {
    /*
     * Eight tabbable links would mean eight presses to get past the rail to the
     * content. The tablist pattern puts one stop in the order and moves within
     * it using the arrow keys.
     */
    setup("account-orders");
    const tabbable = screen.getAllByRole("tab").filter((t) => t.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute("id", "tab-account-orders");
  });

  it("selects a section when it is clicked", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("tab", { name: /Wallet/ }));
    expect(onChange).toHaveBeenCalledWith("account-wallet");
  });

  it("moves to the next section on ArrowRight", async () => {
    const { onChange } = setup("account-overview");
    screen.getByRole("tab", { selected: true }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("account-orders");
  });

  it("wraps from the last section back to the first", async () => {
    const { onChange } = setup("account-wishlist");
    screen.getByRole("tab", { selected: true }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("account-overview");
  });

  it("jumps to the ends with Home and End", async () => {
    const { onChange } = setup("account-orders");
    screen.getByRole("tab", { selected: true }).focus();
    await userEvent.keyboard("{Home}");
    expect(onChange).toHaveBeenCalledWith("account-overview");
    await userEvent.keyboard("{End}");
    expect(onChange).toHaveBeenCalledWith("account-wishlist");
  });

  it("shows what is in a section without opening it", () => {
    // The careers portal ticks a finished step. Nothing in an account is ever
    // finished, so the equivalent signal is how much is in each one.
    setup();
    expect(screen.getByRole("tab", { name: /Orders/ })).toHaveTextContent("10");
    expect(screen.getByRole("tab", { name: /Wallet/ })).toHaveTextContent("₹180");
  });
});
