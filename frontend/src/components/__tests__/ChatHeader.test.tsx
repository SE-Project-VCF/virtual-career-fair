import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ChatHeader from "../chat/ChatHeader";

describe("ChatHeader", () => {
  it("renders the title", () => {
    render(<ChatHeader title="Test Chat" />);
    expect(screen.getByText("Test Chat")).toBeInTheDocument();
  });

  it("renders the back button when onBack is provided", () => {
    const onBack = vi.fn();
    render(<ChatHeader title="Test Chat" onBack={onBack} />);
    const backButton = screen.getByRole("button", { name: /back to dashboard/i });
    expect(backButton).toBeInTheDocument();
  });

  it("calls onBack when back button is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<ChatHeader title="Test Chat" onBack={onBack} />);

    const backButton = screen.getByRole("button", { name: /back to dashboard/i });
    await user.click(backButton);

    expect(onBack).toHaveBeenCalledOnce();
  });

  it("does not render back button when onBack is not provided", () => {
    render(<ChatHeader title="Test Chat" />);
    const backButton = screen.queryByRole("button", { name: /back to dashboard/i });
    expect(backButton).not.toBeInTheDocument();
  });

  it("renders the new chat button when onNewChat is provided", () => {
    const onNewChat = vi.fn();
    render(<ChatHeader title="Test Chat" onNewChat={onNewChat} />);
    const newChatButton = screen.getByRole("button", { name: /start new chat/i });
    expect(newChatButton).toBeInTheDocument();
  });

  it("calls onNewChat when new chat button is clicked", async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    render(<ChatHeader title="Test Chat" onNewChat={onNewChat} />);

    const newChatButton = screen.getByRole("button", { name: /start new chat/i });
    await user.click(newChatButton);

    expect(onNewChat).toHaveBeenCalledOnce();
  });

  it("does not render new chat button when onNewChat is not provided", () => {
    render(<ChatHeader title="Test Chat" />);
    const newChatButton = screen.queryByRole("button", { name: /start new chat/i });
    expect(newChatButton).not.toBeInTheDocument();
  });

  it("renders both buttons when both callbacks are provided", () => {
    const onBack = vi.fn();
    const onNewChat = vi.fn();
    render(<ChatHeader title="Test Chat" onBack={onBack} onNewChat={onNewChat} />);

    expect(screen.getByRole("button", { name: /back to dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start new chat/i })).toBeInTheDocument();
  });
});
