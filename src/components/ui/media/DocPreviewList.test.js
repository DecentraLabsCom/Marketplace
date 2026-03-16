/**
 * @file DocPreviewList.test.js
 * @description Tests for DocPreviewList component
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DocPreviewList from './DocPreviewList';

jest.mock('./MediaDisplayWithFallback', () => ({
  __esModule: true,
  default: ({ mediaPath, title }) => (
    <div data-testid="media-fallback">{title} ({mediaPath})</div>
  )
}));

describe('DocPreviewList', () => {
  const docs = [
    'https://site.com/docs/file1.pdf',
    'https://site.com/docs/file2.pdf'
  ];

  it('renders document list and filenames', () => {
    render(<DocPreviewList docUrls={docs} removeDoc={jest.fn()} />);
    expect(screen.getByText('Uploaded Documents:')).toBeInTheDocument();
    expect(screen.getByText('file1.pdf (https://site.com/docs/file1.pdf)')).toBeInTheDocument();
    expect(screen.getByText('file2.pdf (https://site.com/docs/file2.pdf)')).toBeInTheDocument();
  });

  it('calls removeDoc with correct index on button click', () => {
    const removeDoc = jest.fn();
    render(<DocPreviewList docUrls={docs} removeDoc={removeDoc} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(removeDoc).toHaveBeenCalledWith(0);
    fireEvent.click(buttons[1]);
    expect(removeDoc).toHaveBeenCalledWith(1);
  });

  it('disables remove button if isExternalURI is true', () => {
    render(<DocPreviewList docUrls={docs} removeDoc={jest.fn()} isExternalURI={true} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });

  it('renders null if docUrls is empty', () => {
    const { container } = render(<DocPreviewList docUrls={[]} removeDoc={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null if docUrls is not provided', () => {
    const { container } = render(<DocPreviewList removeDoc={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders with a single document', () => {
    render(<DocPreviewList docUrls={['/docs/only.pdf']} removeDoc={jest.fn()} />);
    expect(screen.getByText('only.pdf (/docs/only.pdf)')).toBeInTheDocument();
  });
});
