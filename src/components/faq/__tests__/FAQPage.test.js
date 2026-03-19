import React from 'react';
import { render, screen } from '@testing-library/react';
import FAQ from '../FAQPage';

describe('FAQPage Component', () => {
  it('renders the FAQ heading', () => {
    render(<FAQ />);
    expect(screen.getByRole('heading', { name: /Frequently Asked Questions/i })).toBeInTheDocument();
  });

  it('renders all static questions in the accordion map', () => {
    render(<FAQ />);
    // Check for some known questions
    expect(screen.getByText(/1. What is DecentraLabs\?/i)).toBeInTheDocument();
    expect(screen.getByText(/7. What is wallet authentication\?/i)).toBeInTheDocument();
    expect(screen.getByText(/14. How can I contact DecentraLabs support\?/i)).toBeInTheDocument();
  });

  it('renders the answer text linked to the questions', () => {
    render(<FAQ />);
    // We confirm the standard text is present in the DOM (details/summary standard HTML rendering)
    expect(screen.getByText(/The marketplace offers a catalogue of online laboratories/i)).toBeInTheDocument();
    expect(screen.getByText(/The \$LAB token is an ERC-20 token/i)).toBeInTheDocument();
  });

  it('renders details layout with svgs correctly', () => {
    const { container } = render(<FAQ />);
    const detailsElements = container.querySelectorAll('details.group');
    expect(detailsElements.length).toBeGreaterThan(10); // Standard length check for faq items
    
    const svgElements = container.querySelectorAll('svg');
    expect(svgElements.length).toBe(detailsElements.length);
  });
});
