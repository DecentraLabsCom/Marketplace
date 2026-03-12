import React from 'react';
import { render, screen } from '@testing-library/react';
import ClientOnly from '../ClientOnly';

describe('ClientOnly', () => {

  it('renders children after mount', () => {
    // useEffect runs after mount, so children should appear
    render(
      <ClientOnly fallback={<span>Loading...</span>}>
        <span>Loaded!</span>
      </ClientOnly>
    );
    // Wait for useEffect to run
    expect(screen.getByText('Loaded!')).toBeInTheDocument();
  });
});
