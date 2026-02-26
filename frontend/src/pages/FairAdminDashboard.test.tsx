import React from 'react';
import { render, screen } from '@testing-library/react';
import FairAdminDashboard from './FairAdminDashboard';

describe('FairAdminDashboard', () => {
  it('renders without crashing', () => {
    render(<FairAdminDashboard />);
    // You can add more specific assertions here if needed
    expect(screen.getByText(/dashboard|admin|fair/i)).toBeInTheDocument();
  });
});
