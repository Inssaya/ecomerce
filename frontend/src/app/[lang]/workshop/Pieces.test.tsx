/**
 * The shelf screen — the one without which the shop is empty.
 *
 * What is worth pinning here is the sequence it refuses to let anyone skip.
 * Each guard exists for a decision this shop already made, and each would be
 * easy to erode later by someone making the screen "friendlier": no publishing
 * without a real photograph, no stock number anywhere, and the waiting list
 * shown where it changes what the owner makes next.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { Pieces } from "./Pieces";
import { admin, type AdminCategory, type AdminProduct } from "@/lib/admin";

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
      categories: vi.fn(),
      createCategory: vi.fn(),
      setCoverPhoto: vi.fn(),
      removePhoto: vi.fn(),
      removePiece: vi.fn(),
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
  category_id: null,
  status: "draft",
  available: 0,
  lead_time_days: null,
  show_piece_numbers: true,
  images: [],
  ...over,
});

const line = (over: Partial<AdminCategory> = {}): AdminCategory => ({
  id: "c1",
  slug: "hooks",
  name_en: "Hooks",
  name_ar: "خطّافات",
  parent_id: null,
  display_order: 0,
  is_active: true,
  ...over,
});

describe("the shelf screen", () => {
  beforeEach(() => {
    vi.mocked(admin.products).mockResolvedValue([product()]);
    vi.mocked(admin.pieces).mockResolvedValue([]);
    vi.mocked(admin.waiting).mockResolvedValue({ waiting: 0 });
    vi.mocked(admin.categories).mockResolvedValue([]);
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

  // ── What kind of thing it is ───────────────────────────────────────────────
  //
  // A visitor's affinity for a category is the highest-weighted term in the
  // feed and it is computed from nothing else. Before this the panel had no way
  // to set one, so every piece had none, and the strongest thing the shelf
  // knows how to do was multiplied by zero for the entire shop.

  it("offers the lines the shop already has", async () => {
    vi.mocked(admin.categories).mockResolvedValue([
      line({ id: "c1", name_en: "Hooks" }),
      line({ id: "c2", name_en: "Lamps" }),
    ]);
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));

    const select = screen.getByLabelText(/what kind of thing/i);
    expect(within(select).getByRole("option", { name: "Hooks" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Lamps" })).toBeInTheDocument();
  });

  it("puts a piece into a line and saves it straight away", async () => {
    vi.mocked(admin.categories).mockResolvedValue([line({ id: "c1", name_en: "Hooks" })]);
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));

    await userEvent.selectOptions(screen.getByLabelText(/what kind of thing/i), "c1");
    await waitFor(() =>
      expect(admin.updateProduct).toHaveBeenCalledWith("en", "p1", { category_id: "c1" }),
    );
  });

  it("names a new line without leaving the piece", async () => {
    // A separate screen for six categories would be a screen nobody opens. The
    // only moment anyone thinks about a line is while looking at a piece.
    vi.mocked(admin.categories).mockResolvedValue([]);
    vi.mocked(admin.createCategory).mockResolvedValue(line({ id: "c9", name_en: "Hooks" }));
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));

    await userEvent.selectOptions(screen.getByLabelText(/what kind of thing/i), "__new__");
    await userEvent.type(screen.getByLabelText(/in English/i), "Hooks");
    await userEvent.type(screen.getByLabelText(/in Arabic/i), "خطّافات");
    await userEvent.click(screen.getByRole("button", { name: /add the kind/i }));

    await waitFor(() =>
      expect(admin.createCategory).toHaveBeenCalledWith("en", "Hooks", "خطّافات"),
    );
    // And the piece is put into it, rather than leaving the owner to pick the
    // thing they just named.
    await waitFor(() =>
      expect(admin.updateProduct).toHaveBeenCalledWith("en", "p1", { category_id: "c9" }),
    );
  });

  it("will not create a line with no English name", async () => {
    // The slug comes from the English name; without one the server has nothing
    // to build a URL from.
    vi.mocked(admin.categories).mockResolvedValue([]);
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));

    await userEvent.selectOptions(screen.getByLabelText(/what kind of thing/i), "__new__");
    await userEvent.type(screen.getByLabelText(/in Arabic/i), "خطّافات");
    expect(screen.getByRole("button", { name: /add the kind/i })).toBeDisabled();
    expect(admin.createCategory).not.toHaveBeenCalled();
  });

  it("says so when a published piece has no line, and stays quiet about drafts", async () => {
    vi.mocked(admin.products).mockResolvedValue([product({ status: "active" })]);
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));
    expect(await screen.findByText(/live with no kind/i)).toBeInTheDocument();
  });

  it("does not nag about a draft that has no line yet", async () => {
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));
    expect(screen.queryByText(/live with no kind/i)).not.toBeInTheDocument();
  });

  it("carries the chosen line into a brand new piece", async () => {
    vi.mocked(admin.categories).mockResolvedValue([line({ id: "c1", name_en: "Hooks" })]);
    vi.mocked(admin.createProduct).mockResolvedValue(product({ id: "new" }));
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: /new piece/i }));

    await userEvent.type(screen.getByLabelText(/name in english/i), "Brass hook");
    await userEvent.type(screen.getByLabelText("Price"), "120");
    await userEvent.selectOptions(screen.getByLabelText(/what kind of thing/i), "c1");
    await userEvent.click(screen.getByRole("button", { name: /create it as a draft/i }));

    await waitFor(() =>
      expect(admin.createProduct).toHaveBeenCalledWith(
        "en",
        expect.objectContaining({ category_id: "c1" }),
      ),
    );
  });

  // ── The photographs, and the count ─────────────────────────────────────────

  const photo = (id: string, primary = false) => ({
    id,
    url: `https://media.example/${id}.jpg`,
    alt: "",
    is_primary: primary,
  });

  it("chooses which photograph the shelf leads with", async () => {
    // The primary photo is the whole of a card in the shelf, and the shelf is
    // where a piece is either tapped or scrolled past. It used to be whichever
    // one happened to be uploaded first, permanently.
    vi.mocked(admin.products).mockResolvedValue([
      product({ images: [photo("m1", true), photo("m2")] }),
    ]);
    vi.mocked(admin.setCoverPhoto).mockResolvedValue({ id: "m2" });
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));

    await userEvent.click(screen.getByRole("button", { name: /make this the cover/i }));
    await waitFor(() => expect(admin.setCoverPhoto).toHaveBeenCalledWith("en", "m2"));
  });

  it("does not offer to promote the photograph that is already the cover", async () => {
    vi.mocked(admin.products).mockResolvedValue([
      product({ images: [photo("m1", true), photo("m2")] }),
    ]);
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));
    expect(screen.getAllByRole("button", { name: /make this the cover/i })).toHaveLength(1);
  });

  it("takes two taps to delete a photograph, and one to change your mind", async () => {
    // Small targets in a dense grid on a phone, and nothing behind it to undo
    // with. One misplaced thumb should not cost the shop its cover photo.
    vi.mocked(admin.products).mockResolvedValue([product({ images: [photo("m1", true)] })]);
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));

    await userEvent.click(screen.getByRole("button", { name: /remove this photo/i }));
    expect(admin.removePhoto).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /^no$/i }));
    expect(admin.removePhoto).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /remove this photo/i }));
    await userEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(admin.removePhoto).toHaveBeenCalledWith("en", "m1"));
  });

  it("lets the owner correct a miscount", async () => {
    vi.mocked(admin.pieces).mockResolvedValue([
      { id: "pc1", number: 1, batch_size: 2, label: "01/02", state: "available" },
      { id: "pc2", number: 2, batch_size: 2, label: "02/02", state: "available" },
    ]);
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));

    await userEvent.click(await screen.findByRole("button", { name: /remove piece number 2/i }));
    await waitFor(() => expect(admin.removePiece).toHaveBeenCalledWith("en", "pc2"));
  });

  it("never offers to remove a piece somebody has bought", async () => {
    // It belongs to an order. The server refuses it, and a button that always
    // fails is worse than no button.
    vi.mocked(admin.pieces).mockResolvedValue([
      { id: "pc1", number: 1, batch_size: 2, label: "01/02", state: "sold" },
      { id: "pc2", number: 2, batch_size: 2, label: "02/02", state: "reserved" },
    ]);
    render(<Pieces lang="en" onExpire={vi.fn()} />);
    await userEvent.click(await screen.findByText("Oak wall shelf"));

    expect(screen.queryByRole("button", { name: /remove piece number/i })).not.toBeInTheDocument();
  });
});
