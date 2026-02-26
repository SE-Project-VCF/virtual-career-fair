import React from 'react';
import { render, screen } from '@testing-library/react';
import FairBooths from './FairBooths';

describe('FairBooths', () => {
  it('renders without crashing', () => {
    render(<FairBooths />);
    // Add more specific assertions as needed
    expect(screen.getByText(/booth|fair/i)).toBeInTheDocument();
  });
});
