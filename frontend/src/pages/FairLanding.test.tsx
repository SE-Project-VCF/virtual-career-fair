import React from 'react';
import { render, screen } from '@testing-library/react';
import FairLanding from './FairLanding';

describe('FairLanding', () => {
  it('renders without crashing', () => {
    render(<FairLanding />);
    expect(screen.getByText(/landing|fair/i)).toBeInTheDocument();
  });
});
