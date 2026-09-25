import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownView } from "./MarkdownView";

describe("MarkdownView", () => {
  it("renders null when content is empty or whitespace", () => {
    const { container: c1 } = render(<MarkdownView content="" />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<MarkdownView content="   " />);
    expect(c2.firstChild).toBeNull();

    const { container: c3 } = render(<MarkdownView />);
    expect(c3.firstChild).toBeNull();
  });

  it("renders headings, bold, and lists correctly", () => {
    const markdown = "## Strategy\n\n- Lead: **Incineroar**\n- Support: *Amoonguss*";
    render(<MarkdownView content={markdown} />);

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toContain("Strategy");

    const boldText = screen.getByText("Incineroar");
    expect(boldText).toBeTruthy();

    const italicText = screen.getByText("Amoonguss");
    expect(italicText).toBeTruthy();
  });

  it("renders task lists with checkbox inputs", () => {
    const markdown = "- [x] Check Trick Room\n- [ ] Check Weather";
    render(<MarkdownView content={markdown} />);

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]?.checked).toBe(true);
    expect(checkboxes[1]?.checked).toBe(false);
  });
});
