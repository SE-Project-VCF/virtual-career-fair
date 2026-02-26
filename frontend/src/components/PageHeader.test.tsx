import React from 'react';
import { render, screen } from '@testing-library/react';
import PageHeader from './PageHeader';

describe('PageHeader', () => {
  it('renders without crashing', () => {
    render(<PageHeader />);
    expect(screen.getByText(/header|page/i)).toBeInTheDocument();
  });
});
