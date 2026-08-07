/**
 * The orders screen — the owner's morning.
 *
 * Until this screen existed an order placed on the site could never be
 * delivered, so the things worth pinning are the ones that would silently stop
 * that working again: that the buttons offered match what the server accepts,
 * that pressing one sends the move and then re-reads the list, and that a
 * refusal is shown rather than swallowed.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { Orders } from "./Orders";
import { admin, NotSignedIn, type AdminOrder } from "@/lib/admin";

vi.mock("@/lib/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin")>("@/lib/admin");
  return { ...actual, admin: { orders: vi.fn(), moveOrder: vi.fn() } };
});

const order = (over: Partial<AdminOrder> = {}): AdminOrder => ({
  reference: "7KQ4M2XP",
  tracking_token: "t".repeat(40),
  customer_name: "Salma B.",
  customer_phone: "0611223344",
  city: "Marrakesh",
  address: { line1: "14 Rue Ibn Sina", city: "Marrakesh", notes: "Second floor" },
  items: [
    {
      title: "Oak wall shelf",
      variant_label: "",
      piece_label: "01/04",
      quantity: 1,
      unit_price: 320,
      subtotal: 320,
      image_url: null,
    },
  ],
  events: [],
  subtotal: 320,
  delivery_fee: 30,
  total: 350,
  status: "placed",
  created_at: "2026-08-07T09:00:00Z",
  whatsapp_url: "https://wa.me/212600112233",
  ...over,
});

describe("the orders screen", () => {
  beforeEach(() => {
    vi.mocked(admin.orders).mockResolvedValue([order()]);
    vi.mocked(admin.moveOrder).mockResolvedValue(order({ status: "confirmed" }));
  });

  it("shows the reference, who it is for and what it is worth", async () => {
    render(<Orders lang="en" onExpire={vi.fn()} />);
    expect(await screen.findByText("7KQ4M2XP")).toBeInTheDocument();
    expect(screen.getByText(/Salma B\./)).toBeInTheDocument();
    expect(screen.getByText("350 MAD")).toBeInTheDocument();
  });

  it("puts the phone one tap away, because every order is cash on delivery", async () => {
    render(<Orders lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("7KQ4M2XP"));
    const call = screen.getByRole("link", { name: "0611223344" });
    expect(call).toHaveAttribute("href", "tel:0611223344");
  });

  it("offers only the moves the server will accept", async () => {
    render(<Orders lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("7KQ4M2XP"));
    // From `placed`: confirm it, or cancel it. Nothing else.
    expect(screen.getByRole("button", { name: /Move 7KQ4M2XP to Confirmed/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Move 7KQ4M2XP to Cancelled/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move 7KQ4M2XP to Delivered/ })).not.toBeInTheDocument();
  });

  it("offers nothing at all on a finished order", async () => {
    vi.mocked(admin.orders).mockResolvedValue([order({ status: "delivered" })]);
    render(<Orders lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("7KQ4M2XP"));
    expect(screen.getByText("This one is finished.")).toBeInTheDocument();
  });

  it("sends the move, then re-reads the list so the screen is not a guess", async () => {
    render(<Orders lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("7KQ4M2XP"));
    await userEvent.click(screen.getByRole("button", { name: /Move 7KQ4M2XP to Confirmed/ }));

    await waitFor(() => {
      expect(admin.moveOrder).toHaveBeenCalledWith("en", "7KQ4M2XP", "confirmed");
    });
    // Once on mount, once after the move.
    await waitFor(() => expect(vi.mocked(admin.orders).mock.calls.length).toBeGreaterThan(1));
  });

  it("says so when the server refuses a move", async () => {
    // The server is the authority on transitions. A button that silently did
    // nothing would leave the owner thinking the order had moved.
    vi.mocked(admin.moveOrder).mockRejectedValue(new Error("nope"));
    render(<Orders lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("7KQ4M2XP"));
    await userEvent.click(screen.getByRole("button", { name: /Move 7KQ4M2XP to Confirmed/ }));
    expect(await screen.findByText(/refused/i)).toBeInTheDocument();
  });

  it("hands back to the sign-in screen when the session has gone", async () => {
    vi.mocked(admin.orders).mockRejectedValue(new NotSignedIn());
    const onExpire = vi.fn();
    render(<Orders lang="en" onExpire={onExpire} />);
    await waitFor(() => expect(onExpire).toHaveBeenCalled());
  });

  it("filters by state without inventing one", async () => {
    render(<Orders lang="en" onExpire={vi.fn()} />);
    await screen.findByText("7KQ4M2XP");
    await userEvent.click(screen.getByRole("button", { name: "Show on its way orders" }));
    await waitFor(() => {
      expect(admin.orders).toHaveBeenLastCalledWith("en", "out_for_delivery", undefined);
    });
  });

  it("reads right in Arabic", async () => {
    render(<Orders lang="ar" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("7KQ4M2XP"));
    expect(screen.getByRole("button", { name: "7KQ4M2XP: مؤكَّد" })).toBeInTheDocument();
  });

  it("finds an order by the phone number the customer reads out", async () => {
    // Every order here is cash on delivery, so every order involves a phone
    // call. The person calling knows their number and their name; the
    // reference is on a page they closed three days ago. The list is capped at
    // sixty, so without this an older order simply cannot be reached.
    render(<Orders lang="en" onExpire={vi.fn()} />);
    await screen.findByText("7KQ4M2XP");

    await userEvent.type(screen.getByLabelText(/search by reference/i), "0612345678");
    await waitFor(
      () => expect(admin.orders).toHaveBeenLastCalledWith("en", undefined, "0612345678"),
      { timeout: 2000 },
    );
  });

  it("says a search found nothing differently from an empty list", async () => {
    // "Nothing here" under a search box reads as "this shop has no orders",
    // which is alarming and wrong.
    render(<Orders lang="en" onExpire={vi.fn()} />);
    await screen.findByText("7KQ4M2XP");

    vi.mocked(admin.orders).mockResolvedValue([]);
    await userEvent.type(screen.getByLabelText(/search by reference/i), "nobody");
    expect(await screen.findByText(/no order matches that/i, {}, { timeout: 2000 })).toBeInTheDocument();
  });
});
