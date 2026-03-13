import React from 'react';
import { render } from '@testing-library/react';
import { FormSkeleton, ButtonLoadingSkeleton } from '../FormSkeleton';

describe('FormSkeleton', () => {
  it('renders the form skeleton layout', () => {
    const { container } = render(<FormSkeleton />);
    // Check for skeleton header
    expect(container.querySelector('.w-48')).toBeInTheDocument();
    expect(container.querySelector('.w-64')).toBeInTheDocument();
    // Check for skeleton date selector
    expect(container.querySelector('.h-64')).toBeInTheDocument();
    // Check for time fields
    expect(container.querySelectorAll('.h-10').length).toBeGreaterThanOrEqual(3);
    // Check for submit button skeleton
    expect(container.querySelector('.w-32')).toBeInTheDocument();
  });
});

describe('ButtonLoadingSkeleton', () => {
  it('renders children when not loading', () => {
    const { getByText } = render(
      <ButtonLoadingSkeleton>
        <button>Submit</button>
      </ButtonLoadingSkeleton>
    );
    expect(getByText('Submit')).toBeInTheDocument();
  });

  it('renders loading overlay when isLoading is true', () => {
    const { container } = render(
      <ButtonLoadingSkeleton isLoading>
        <button>Submit</button>
      </ButtonLoadingSkeleton>
    );
    expect(container.querySelector('.spinner')).toBeInTheDocument();
    // Use a more robust selector for the overlay
    expect(container.querySelector('.absolute')).toBeInTheDocument();
  });
});
