/**
 * The quoting screen — the other half of what this shop says it is.
 *
 * The rule the whole flow protects is that a quote is not an order, and both
 * halves of a quote are required: a price without a date is the vagueness that
 * gets a package refused three weeks later. Those are the two things pinned
 * here, plus the default that makes the screen useful — it opens on the
 * requests waiting on an answer, because that is the only reason to open it.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { Requests } from "./Requests";
import { admin, type AdminRequest } from "@/lib/admin";

vi.mock("@/lib/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin")>("@/lib/admin");
  return {
    ...actual,
    admin: { requests: vi.fn(), quote: vi.fn(), moveRequest: vi.fn() },
  };
});

const request = (over: Partial<AdminRequest> = {}): AdminRequest => ({
  reference: "QQWQQH4X",
  tracking_token: "t".repeat(40),
  description: "A bracket for a shutter, the plastic one snapped. I have the broken half.",
  status: "requested",
  quote_price: null,
  lead_time_days: null,
  promised_for: null,
  order_reference: null,
  created_at: "2026-08-07T09:00:00Z",
  whatsapp_url: "https://wa.me/212600112233",
  ...over,
});

describe("the quoting screen", () => {
  beforeEach(() => {
    vi.mocked(admin.requests).mockResolvedValue([request()]);
    vi.mocked(admin.quote).mockResolvedValue(request({ status: "quoted", quote_price: 140 }));
    vi.mocked(admin.moveRequest).mockResolvedValue(request({ status: "declined" }));
  });

  it("opens on the ones waiting on an answer", async () => {
    render(<Requests lang="en" onExpire={vi.fn()} />);
    await waitFor(() => expect(admin.requests).toHaveBeenCalledWith("en", "requested"));
  });

  it("shows what they asked for in their own words", async () => {
    render(<Requests lang="en" onExpire={vi.fn()} />);
    expect(await screen.findByText(/bracket for a shutter/)).toBeInTheDocument();
  });

  it("sends a price and a real number of days together", async () => {
    render(<Requests lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("QQWQQH4X"));

    await userEvent.type(screen.getByLabelText("Price"), "140");
    await userEvent.type(screen.getByLabelText(/in how many days/i), "5");
    await userEvent.click(screen.getByRole("button", { name: /send the price/i }));

    await waitFor(() =>
      expect(admin.quote).toHaveBeenCalledWith("en", "QQWQQH4X", 140, 5, ""),
    );
  });

  it("will not send a price with no date", async () => {
    // Both fields are `required`, so the browser stops it before the handler
    // runs and shows its own message against the empty field — which is better
    // placed than anything this screen could print. The guard inside `send` is
    // the backstop for a browser that does not enforce it.
    render(<Requests lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("QQWQQH4X"));

    const price = screen.getByLabelText("Price") as HTMLInputElement;
    await userEvent.type(price, "140");
    await userEvent.click(screen.getByRole("button", { name: /send the price/i }));

    expect(price.form?.checkValidity()).toBe(false);
    expect(admin.quote).not.toHaveBeenCalled();
  });

  it("accepts an ordinary price like 140", async () => {
    // Regression: the field was `step={10}` with `min={1}`, and the step counts
    // from the minimum — so 1, 11, 21… were valid and 140 was not. The browser
    // refused to submit and the owner saw a send button that did nothing.
    render(<Requests lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("QQWQQH4X"));

    for (const amount of ["140", "250", "99"]) {
      const price = screen.getByLabelText("Price") as HTMLInputElement;
      await userEvent.clear(price);
      await userEvent.type(price, amount);
      expect(price.checkValidity(), `${amount} MAD must be a valid price`).toBe(true);
    }
  });

  it("says out loud that nothing is owed until they agree", async () => {
    // The one rule the whole flow exists to protect, on the screen where the
    // owner might otherwise think sending a price is closing a sale.
    render(<Requests lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("QQWQQH4X"));
    expect(screen.getByText(/nothing is owed until they agree/i)).toBeInTheDocument();
  });

  it("can decline a request outright", async () => {
    render(<Requests lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("QQWQQH4X"));
    await userEvent.click(screen.getByRole("button", { name: /can't make this/i }));
    await waitFor(() =>
      expect(admin.moveRequest).toHaveBeenCalledWith("en", "QQWQQH4X", "declined"),
    );
  });

  it("stops offering to price something already priced and agreed", async () => {
    vi.mocked(admin.requests).mockResolvedValue([
      request({ status: "approved", quote_price: 140, promised_for: "2026-08-12" }),
    ]);
    render(<Requests lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("QQWQQH4X"));
    expect(screen.queryByRole("button", { name: /send the price/i })).not.toBeInTheDocument();
    expect(screen.getByText(/140 MAD/)).toBeInTheDocument();
  });
});
