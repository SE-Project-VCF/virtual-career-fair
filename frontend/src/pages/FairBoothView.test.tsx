import React from 'react';
import { render, screen } from '@testing-library/react';
import FairBoothView from './FairBoothView';

describe('FairBoothView', () => {
  it('renders without crashing', () => {
    render(<FairBoothView />);
    expect(screen.getByText(/booth|view|fair/i)).toBeInTheDocument();
  });
});
