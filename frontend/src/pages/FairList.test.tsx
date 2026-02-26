import React from 'react';
import { render, screen } from '@testing-library/react';
import FairList from './FairList';

describe('FairList', () => {
  it('renders without crashing', () => {
    render(<FairList />);
    expect(screen.getByText(/list|fair/i)).toBeInTheDocument();
  });
});
