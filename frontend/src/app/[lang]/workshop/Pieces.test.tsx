/**
 * The shelf screen — the one without which the shop is empty.
 *
 * What is worth pinning here is the sequence it refuses to let anyone skip.
 * Each guard exists for a decision this shop already made, and each would be
 * easy to erode later by someone making the screen "friendlier": no publishing
 * without a real photograph, no stock number anywhere, and the waiting list
 * shown where it changes what the owner makes next.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { Pieces } from "./Pieces";
import { admin, type AdminProduct } from "@/lib/admin";

vi.mock("@/lib/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin")>("@/lib/admin");
  return {
    ...actual,
    admin: {
      products: vi.fn(),
      createProduct: vi.fn(),
      updateProduct: vi.fn(),
      addPhoto: vi.fn(),
      pieces: vi.fn(),
      addPieces: vi.fn(),
      waiting: vi.fn(),
    },
  };
});

const product = (over: Partial<AdminProduct> = {}): AdminProduct => ({
  id: "p1",
  slug: "oak-wall-shelf",
  kind: "shelf",
  title_en: "Oak wall shelf",
  title_ar: "رف بلوط",
  description_en: "Cut and oiled by hand.",
  price: 320,
  status: "draft",
  available: 0,
  lead_time_days: null,
  show_piece_numbers: true,
  images: [],
  ...over,
});

describe("the shelf screen", () => {
  beforeEach(() => {
    vi.mocked(admin.products).mockResolvedValue([product()]);
    vi.mocked(admin.pieces).mockResolvedValue([]);
    vi.mocked(admin.waiting).mockResolvedValue({ waiting: 0 });
    vi.mocked(admin.updateProduct).mockResolvedValue(product({ status: "active" }));
    vi.mocked(admin.addPieces).mockResolvedValue([]);
  });

  it("says the shelf is empty rather than showing nothing at all", async () => {
    vi.mocked(admin.products).mockResolvedValue([]);
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    expect(await screen.findByText(/shelf is empty/i)).toBeInTheDocument();
  });

  it("marks a piece nobody can see as a draft", async () => {
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    expect(await screen.findByText("draft")).toBeInTheDocument();
  });

  it("explains that a real photograph is needed before publishing", async () => {
    // The rule is the brand, not a technical limit — the photo is the actual
    // object the customer receives.
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));
    expect(screen.getByText(/at least one real photo/i)).toBeInTheDocument();
  });

  it("shows the server's refusal when publishing is not allowed", async () => {
    vi.mocked(admin.updateProduct).mockRejectedValue(
      new Error("Add at least one photo of the piece before publishing it"),
    );
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));
    await userEvent.click(screen.getByRole("button", { name: /publish it/i }));
    expect(
      await screen.findByText("Add at least one photo of the piece before publishing it"),
    ).toBeInTheDocument();
  });

  it("adds how many were made, not a stock number", async () => {
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));

    const howMany = screen.getByLabelText(/how many/i);
    await userEvent.clear(howMany);
    await userEvent.type(howMany, "4");
    await userEvent.click(screen.getByRole("button", { name: /add to the shelf/i }));

    await waitFor(() => expect(admin.addPieces).toHaveBeenCalledWith("en", "p1", 4));
  });

  it("tells the owner who is waiting, because that is why they would make more", async () => {
    vi.mocked(admin.waiting).mockResolvedValue({ waiting: 3 });
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));
    expect(await screen.findByText(/3 people are waiting/i)).toBeInTheDocument();
  });

  it("does not ask a made-to-order piece how many exist", async () => {
    // It cannot run out. A count would be a number with no meaning.
    vi.mocked(admin.products).mockResolvedValue([
      product({ kind: "workshop", lead_time_days: 6, available: null }),
    ]);
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));
    expect(screen.queryByLabelText(/how many/i)).not.toBeInTheDocument();
    expect(screen.getByText(/made to order/i)).toBeInTheDocument();
  });

  it("creates a piece as a draft and asks for a lead time only when it needs one", async () => {
    vi.mocked(admin.createProduct).mockResolvedValue(product({ id: "new" }));
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: /new piece/i }));

    // The Shelf is the default, and a shelf piece has no lead time.
    expect(screen.queryByLabelText(/in how many days/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /the workshop/i }));
    expect(screen.getByLabelText(/in how many days/i)).toBeInTheDocument();
  });
});
