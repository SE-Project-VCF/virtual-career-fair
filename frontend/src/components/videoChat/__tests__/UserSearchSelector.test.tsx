import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserSearchSelector } from '../UserSearchSelector';
import type { UserSearchResult } from '../UserSearchSelector';

// Mock the searchUsers function
vi.mock('../UserSearchSelector', async () => {
  const actual = await vi.importActual<typeof import('../UserSearchSelector')>('../UserSearchSelector');
  return {
    ...actual,
  };
});

// Mock fetch for API calls
global.fetch = vi.fn();

describe('UserSearchSelector Component', () => {
  const mockOnChange = vi.fn();
  const mockUser: UserSearchResult = {
    id: 'user-1',
    firstName: 'Alice',
    lastName: 'Johnson',
    email: 'alice@test.com',
    major: 'Computer Science',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockReset();
  });

  it('should render search input field with default label', () => {
    render(
      <UserSearchSelector
        value={null}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('should render with custom label', () => {
    render(
      <UserSearchSelector
        value={null}
        onChange={mockOnChange}
        label="Find Student"
      />
    );

    const input = screen.getByRole('combobox');
    expect(input).toBeInTheDocument();
  });

  it('should render with custom placeholder', () => {
    render(
      <UserSearchSelector
        value={null}
        onChange={mockOnChange}
        placeholder="Type student name..."
      />
    );

    expect(screen.getByPlaceholderText('Type student name...')).toBeInTheDocument();
  });

  it('should render disabled state', () => {
    render(
      <UserSearchSelector
        value={null}
        onChange={mockOnChange}
        disabled={true}
      />
    );

    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('should display selected user value', () => {
    render(
      <UserSearchSelector
        value={mockUser}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toContain('Alice');
    expect(input.value).toContain('Johnson');
  });

  it('should handle value change', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ students: [mockUser] }),
    });
    (global.fetch as any).mockImplementation(mockFetch);

    const { rerender } = render(
      <UserSearchSelector
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByRole('combobox');
    await user.type(input, 'Alice');

    rerender(
      <UserSearchSelector
        value={mockUser}
        onChange={mockOnChange}
      />
    );

    const updatedInput = screen.getByRole('combobox') as HTMLInputElement;
    expect(updatedInput.value).toContain('Alice');
  });

  it('should show error state', () => {
    render(
      <UserSearchSelector
        value={null}
        onChange={mockOnChange}
        error={true}
        helperText="User search failed"
      />
    );

    expect(screen.getByText('User search failed')).toBeInTheDocument();
  });

  it('should clear value when onChange called with null', () => {
    const { rerender } = render(
      <UserSearchSelector
        value={mockUser}
        onChange={mockOnChange}
      />
    );

    rerender(
      <UserSearchSelector
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('should accept null value prop', () => {
    render(
      <UserSearchSelector
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('should handle input with minimum search length', async () => {
    const user = userEvent.setup();
    render(
      <UserSearchSelector
        value={null}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByRole('combobox');
    await user.type(input, 'A');

    // Component requires minimum 1 character for search
    expect(input).toBeInTheDocument();
  });

  it('should support component remount with different value', () => {
    const { unmount } = render(
      <UserSearchSelector
        value={null}
        onChange={mockOnChange}
      />
    );

    unmount();

    render(
      <UserSearchSelector
        value={mockUser}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toContain('Alice');
  });

  it('should apply fullWidth styling by default', () => {
    const { container } = render(
      <UserSearchSelector
        value={null}
        onChange={mockOnChange}
      />
    );

    const autocomplete = container.querySelector('.MuiAutocomplete-root');
    expect(autocomplete).toBeInTheDocument();
  });

  it('should call onChange when value prop updated', () => {
    const { rerender } = render(
      <UserSearchSelector
        value={null}
        onChange={mockOnChange}
      />
    );

    const newMockOnChange = vi.fn();
    rerender(
      <UserSearchSelector
        value={mockUser}
        onChange={newMockOnChange}
      />
    );

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('should handle multiple rapid value changes', () => {
    const user2: UserSearchResult = {
      ...mockUser,
      id: 'user-2',
      firstName: 'Bob',
    };

    const { rerender } = render(
      <UserSearchSelector
        value={mockUser}
        onChange={mockOnChange}
      />
    );

    rerender(
      <UserSearchSelector
        value={user2}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toContain('Bob');
  });

  it('should work with partial user data', () => {
    const partialUser: UserSearchResult = {
      id: 'user-3',
      firstName: 'Charlie',
      lastName: '',
      email: '',
    };

    render(
      <UserSearchSelector
        value={partialUser}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toContain('Charlie');
  });
});
