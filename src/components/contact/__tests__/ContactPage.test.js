import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Contact from '../ContactPage';
import { sendMailto } from '@/utils/browser/sendMailto';

// Mock the browser utility for sending mailto
jest.mock('@/utils/browser/sendMailto', () => ({
  sendMailto: jest.fn(),
}));

describe('ContactPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the Contact Information heading and form fields', () => {
    render(<Contact />);
    expect(screen.getByRole('heading', { name: /Contact Information/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Your Email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Your Message/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send Message/i })).toBeInTheDocument();
    expect(screen.getByText('contact@nebsyst.com')).toBeInTheDocument();
  });

  it('calls sendMailto with formatted parameters on form submission', () => {
    render(<Contact />);
    
    // Fill the inputs
    const emailInput = screen.getByPlaceholderText(/Your Email/i);
    const messageInput = screen.getByPlaceholderText(/Your Message/i);
    
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.change(messageInput, { target: { value: 'Hello, world!' } });
    
    // Submit the form
    const submitBtn = screen.getByRole('button', { name: /Send Message/i });
    fireEvent.click(submitBtn);

    expect(sendMailto).toHaveBeenCalledTimes(1);
    
    // Check parameters format
    const calledWithUri = sendMailto.mock.calls[0][0];
    expect(calledWithUri).toContain('mailto:contact@nebsyst.com');
    expect(calledWithUri).toContain('subject=New%20message%20from%20DecentraLabs%20form');
    expect(calledWithUri).toContain('From%3A%20user%40example.com');
    expect(calledWithUri).toContain('Hello%2C%20world!');
  });
});
