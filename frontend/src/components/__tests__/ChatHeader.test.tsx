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

  it("renders with only title when no callbacks provided", () => {
    render(<ChatHeader title="My Chat Room" />);
    
    expect(screen.getByText("My Chat Room")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders back button with tooltip", () => {
    const onBack = vi.fn();
    render(<ChatHeader title="Test" onBack={onBack} />);
    
    const backButton = screen.getByRole("button", { name: /back to dashboard/i });
    expect(backButton).toBeInTheDocument();
  });

  it("renders new chat button with tooltip", () => {
    const onNewChat = vi.fn();
    render(<ChatHeader title="Test" onNewChat={onNewChat} />);
    
    const newChatButton = screen.getByRole("button", { name: /start new chat/i });
    expect(newChatButton).toBeInTheDocument();
  });

  it("renders title with proper heading level", () => {
    render(<ChatHeader title="Important Chat" onNewChat={vi.fn()} onBack={vi.fn()} />);
    
    const heading = screen.getByRole("heading", { name: "Important Chat" });
    expect(heading).toBeInTheDocument();
  });

  it("handles multiple renders with different props", () => {
    const { rerender } = render(<ChatHeader title="First" />);
    expect(screen.getByText("First")).toBeInTheDocument();
    
    rerender(<ChatHeader title="Second" onNewChat={vi.fn()} />);
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start new chat/i })).toBeInTheDocument();
    
    rerender(<ChatHeader title="Third" onBack={vi.fn()} />);
    expect(screen.getByText("Third")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to dashboard/i })).toBeInTheDocument();
  });

  it("renders all elements when fully configured", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onNewChat = vi.fn();
    
    render(<ChatHeader title="Full Chat" onBack={onBack} onNewChat={onNewChat} />);
    
    // Verify all elements are present
    expect(screen.getByText("Full Chat")).toBeInTheDocument();
    const backButton = screen.getByRole("button", { name: /back to dashboard/i });
    const newChatButton = screen.getByRole("button", { name: /start new chat/i });
    
    expect(backButton).toBeInTheDocument();
    expect(newChatButton).toBeInTheDocument();
    
    // Test interactions
    await user.click(backButton);
    expect(onBack).toHaveBeenCalledOnce();
    
    await user.click(newChatButton);
    expect(onNewChat).toHaveBeenCalledOnce();
  });

  it("renders icons inside buttons", () => {
    const onBack = vi.fn();
    const onNewChat = vi.fn();
    
    const { container } = render(
      <ChatHeader title="Test" onBack={onBack} onNewChat={onNewChat} />
    );
    
    // MUI icons render as SVG elements
    const svgElements = container.querySelectorAll("svg");
    expect(svgElements.length).toBeGreaterThanOrEqual(2);
  });

  it("renders title text with heading variant", () => {
    render(<ChatHeader title="Chat Title Text" />);
    
    const heading = screen.getByText("Chat Title Text");
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe("H6");
  });

  it("renders with different title strings", () => {
    const { rerender } = render(<ChatHeader title="" />);
    expect(screen.queryByRole("heading")).toBeInTheDocument();
    
    rerender(<ChatHeader title="A" />);
    expect(screen.getByText("A")).toBeInTheDocument();
    
    rerender(<ChatHeader title="Very Long Chat Title Name" />);
    expect(screen.getByText("Very Long Chat Title Name")).toBeInTheDocument();
  });

  it("maintains button accessibility with aria labels", () => {
    const onBack = vi.fn();
    const onNewChat = vi.fn();
    
    render(<ChatHeader title="Test" onBack={onBack} onNewChat={onNewChat} />);
    
    // Buttons should be accessible via their tooltip text
    const backButton = screen.getByRole("button", { name: /back to dashboard/i });
    const newChatButton = screen.getByRole("button", { name: /start new chat/i });
    
    expect(backButton).toBeVisible();
    expect(newChatButton).toBeVisible();
  });

  it("renders heading with correct tag and content", () => {
    const { container } = render(
      <ChatHeader title="My Heading Title" onNewChat={vi.fn()} />
    );
    
    const h6 = container.querySelector("h6");
    expect(h6).toBeInTheDocument();
    expect(h6?.textContent).toBe("My Heading Title");
  });

  it("renders new chat button with icon element", () => {
    render(
      <ChatHeader title="Test" onNewChat={vi.fn()} />
    );
    
    const button = screen.getByRole("button", { name: /start new chat/i });
    const svg = button.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders back button with icon element", () => {
    render(
      <ChatHeader title="Test" onBack={vi.fn()} />
    );
    
    const button = screen.getByRole("button", { name: /back to dashboard/i });
    const svg = button.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("verifies component structure with all props", () => {
    const onBack = vi.fn();
    const onNewChat = vi.fn();
    const { container } = render(
      <ChatHeader title="Structure Test" onBack={onBack} onNewChat={onNewChat} />
    );
    
    // Verify heading exists with exact text
    const heading = container.querySelector('h6');
    expect(heading?.textContent).toBe("Structure Test");
    
    // Verify both SVG icons are present
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(2);
  });

  it("renders minimal component with only title", () => {
    const { container } = render(<ChatHeader title="Minimal" />);
    
    // Should have heading
    const heading = container.querySelector('h6');
    expect(heading).toBeTruthy();
    expect(heading?.textContent).toBe("Minimal");
    
    // Should have no buttons
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
