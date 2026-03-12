import { render, screen } from '@testing-library/react';
import FAQ from '../FAQPage';

describe('FAQPage', () => {
  it('renders FAQ title and all questions', () => {
    render(<FAQ />);
    expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument();
    // Check some representative questions
    expect(screen.getAllByText(/What is DecentraLabs/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/How do I access a lab/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Can I access labs from anywhere/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/How can I contact DecentraLabs support/i).length).toBeGreaterThan(0);
  });

  it('renders answers for each question', () => {
    render(<FAQ />);
    expect(screen.getByText(/DecentraLabs is a project revolutionizing/i)).toBeInTheDocument();
    expect(screen.getByText(/To access a lab on DecentraLabs/i)).toBeInTheDocument();
    expect(screen.getByText(/Yes, all labs on DecentraLabs are remotely accessible/i)).toBeInTheDocument();
    expect(screen.getByText(/If you have any questions or need support/i)).toBeInTheDocument();
  });
});
