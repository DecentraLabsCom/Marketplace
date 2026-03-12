import { render, screen } from '@testing-library/react';
import About from '../AboutPage';

describe('AboutPage', () => {
  it('renders Nebsyst and DecentraLabs sections', () => {
    render(<About />);
    expect(screen.getByText('About DecentraLabs')).toBeInTheDocument();
    expect(screen.getByText('Nebsyst')).toBeInTheDocument();
    expect(screen.getByText('DecentraLabs')).toBeInTheDocument();
  });

  it('contains Nebsyst description and link', () => {
    render(<About />);
    expect(screen.getByText(/Nebsyst is a leading provider/i)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /nebsyst.com/i });
    expect(links[0]).toHaveAttribute('href', 'https://nebsyst.com');
  });

  it('contains DecentraLabs description and link', () => {
    render(<About />);
    expect(screen.getByText(/DecentraLabs is a project by Nebsyst/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /decentralabs.nebsyst.com/i })).toHaveAttribute('href', 'https://decentralabs.nebsyst.com');
  });
});
