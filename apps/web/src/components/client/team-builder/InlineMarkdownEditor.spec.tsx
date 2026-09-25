import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { InlineMarkdownEditor } from "./InlineMarkdownEditor";

describe("InlineMarkdownEditor", () => {
  it("renders editor without crashing", () => {
    const handleChange = vi.fn();
    const { container } = render(<InlineMarkdownEditor value="" onChange={handleChange} />);
    expect(container).toBeTruthy();
  });

  it("clicks checklist button and emits checklist markdown", () => {
    const handleChange = vi.fn();
    const { container } = render(<InlineMarkdownEditor value="" onChange={handleChange} />);

    const checklistBtn = screen.getByLabelText("task-list");
    expect(checklistBtn).toBeTruthy();

    act(() => {
      fireEvent.click(checklistBtn);
    });

    expect(handleChange).toHaveBeenCalled();
    const lastCall = handleChange.mock.calls[handleChange.mock.calls.length - 1][0];
    expect(lastCall).toContain("- [ ]");
    // Verify no trailing extra empty paragraph was forced
    expect(container.querySelectorAll("ul[data-type='taskList']")).toHaveLength(1);
    expect(container.querySelectorAll("li[data-type='taskItem']")).toHaveLength(1);
  });

  it("renders initial checklist markdown without converting to literal text", () => {
    const handleChange = vi.fn();
    const { container } = render(
      <InlineMarkdownEditor value="- [ ] Task item 1" onChange={handleChange} />,
    );
    expect(container.querySelector("ul[data-type='taskList']")).toBeTruthy();
    expect(container.querySelector("li[data-type='taskItem']")).toBeTruthy();
  });

  it("switches from bullet list to checklist cleanly without nesting", () => {
    const handleChange = vi.fn();
    const { container } = render(<InlineMarkdownEditor value="" onChange={handleChange} />);

    const bulletBtn = screen.getByLabelText("bullet-list");
    const checklistBtn = screen.getByLabelText("task-list");

    // First click bullet list
    act(() => {
      fireEvent.click(bulletBtn);
    });
    expect(container.querySelectorAll("ul")).toHaveLength(1);
    expect(container.querySelectorAll("li[data-type='taskItem']")).toHaveLength(0);

    // Now switch to checklist
    act(() => {
      fireEvent.click(checklistBtn);
    });
    // Should be exactly 1 ul (taskList) and 1 li (taskItem), NO nested lists
    expect(container.querySelectorAll("ul")).toHaveLength(1);
    expect(container.querySelectorAll("ul[data-type='taskList']")).toHaveLength(1);
    expect(container.querySelectorAll("li[data-type='taskItem']")).toHaveLength(1);
    expect(container.querySelectorAll("li:not([data-type='taskItem'])")).toHaveLength(0);
  });
});
