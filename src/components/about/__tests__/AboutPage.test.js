import React from 'react';
import { render, screen } from '@testing-library/react';
import About from '../AboutPage';

describe('AboutPage Component', () => {
  it('renders the About DecentraLabs heading', () => {
    render(<About />);
    expect(screen.getByRole('heading', { name: /About DecentraLabs/i })).toBeInTheDocument();
  });

  it('renders information about Nebsyst', () => {
    render(<About />);
    expect(screen.getByRole('heading', { name: /Nebsyst/i })).toBeInTheDocument();
    expect(screen.getByText(/Nebsyst is a leading provider of innovative solutions/i)).toBeInTheDocument();
  });

  it('renders information about DecentraLabs', () => {
    render(<About />);
    expect(screen.getByRole('heading', { name: /^DecentraLabs$/i })).toBeInTheDocument();
    expect(screen.getByText(/DecentraLabs is a project by Nebsyst/i)).toBeInTheDocument();
  });

  it('contains correctly formatted hyperlinks', () => {
    render(<About />);
    const nebsystLink = screen.getByRole('link', { name: /^nebsyst\.com$/i });
    expect(nebsystLink).toHaveAttribute('href', 'https://nebsyst.com');

    const projectLink = screen.getByRole('link', { name: /^decentralabs\.nebsyst\.com$/i });
    expect(projectLink).toHaveAttribute('href', 'https://decentralabs.nebsyst.com');
  });
});
