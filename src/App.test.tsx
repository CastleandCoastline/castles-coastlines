import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders app with Castles & Coastlines branding', () => {
  render(<App />);
  const brandingElement = screen.getByText(/Castles & Coastlines/i);
  expect(brandingElement).toBeInTheDocument();
});
