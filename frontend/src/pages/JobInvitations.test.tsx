import React from 'react';
import { render, screen } from '@testing-library/react';
import JobInvitations from './JobInvitations';

describe('JobInvitations', () => {
  it('renders without crashing', () => {
    render(<JobInvitations />);
    expect(screen.getByText(/job|invitation/i)).toBeInTheDocument();
  });
});
