import { render, screen, fireEvent } from '@testing-library/react';
import Contact from '../ContactPage';
jest.mock('@/utils/browser/sendMailto', () => ({
  sendMailto: jest.fn(),
}));
import { sendMailto } from '@/utils/browser/sendMailto';

describe('ContactPage', () => {
  it('renders contact form and info', () => {
    render(<Contact />);
    expect(screen.getByText('Contact Information')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your Message')).toBeInTheDocument();
    expect(screen.getByText('Send Message')).toBeInTheDocument();
    expect(screen.getByText('contact@nebsyst.com')).toBeInTheDocument();
  });

  it('submits the form and triggers mailto', () => {
    render(<Contact />);
    const emailInput = screen.getByPlaceholderText('Your Email');
    const messageInput = screen.getByPlaceholderText('Your Message');
    const form = emailInput.closest('form');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(messageInput, { target: { value: 'Hello world!' } });
    fireEvent.submit(form);

    const mailtoArg = sendMailto.mock.calls[0][0];
    expect(mailtoArg).toContain('mailto:contact@nebsyst.com');
    expect(mailtoArg).toContain('test%40example.com');
    expect(mailtoArg).toContain('Hello%20world!');
  });
});
