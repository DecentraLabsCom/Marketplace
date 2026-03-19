import React from 'react';
import { render, screen } from '@testing-library/react';
import { 
  Card, CardHeader, CardContent, CardFooter,
  Container, Grid, Stack, Inline, Divider, Spacer 
} from '../Layout';

describe('Layout Components', () => {
  
  describe('Card Components', () => {
    it('renders a Card with content and variants', () => {
      const { rerender } = render(<Card data-testid="card">Test Content</Card>);
      let card = screen.getByTestId('card');
      expect(card).toBeInTheDocument();
      expect(card).toHaveTextContent('Test Content');
      expect(card).toHaveClass('bg-neutral-200'); // default variant

      // Modal variant
      rerender(<Card data-testid="card" variant="modal" border={true} padding="sm">Test</Card>);
      card = screen.getByTestId('card');
      expect(card).toHaveClass('bg-white');
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('p-4');
    });

    it('renders CardHeader with title and actions', () => {
      render(
        <CardHeader 
          title="My Title" 
          subtitle="My Subtitle" 
          actions={<button>Click</button>} 
        />
      );
      expect(screen.getByText('My Title')).toBeInTheDocument();
      expect(screen.getByText('My Subtitle')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Click' })).toBeInTheDocument();
    });

    it('renders CardContent and CardFooter', () => {
      render(
        <>
          <CardContent><p>Body</p></CardContent>
          <CardFooter align="center"><footer>End</footer></CardFooter>
        </>
      );
      expect(screen.getByText('Body')).toBeInTheDocument();
      expect(screen.getByText('End')).toBeInTheDocument();
      // Test align prop application directly
      expect(screen.getByText('End').parentElement).toHaveClass('justify-center');
    });
  });

  describe('Container', () => {
    it('renders container with default and custom tags', () => {
      const { rerender } = render(<Container data-testid="box">Content</Container>);
      const box = screen.getByTestId('box');
      expect(box.tagName).toBe('DIV');
      expect(box).toHaveClass('container mx-auto px-4'); // defaults

      rerender(<Container data-testid="box" as="section" padding="none">Content</Container>);
      const section = screen.getByTestId('box');
      expect(section.tagName).toBe('SECTION');
      expect(section).not.toHaveClass('px-4'); // none padding
    });
  });

  describe('Grid', () => {
    it('renders grid with specified cols and gaps', () => {
      render(<Grid data-testid="grid" cols={3} gap="lg">Items</Grid>);
      const grid = screen.getByTestId('grid');
      expect(grid).toHaveClass('grid');
      expect(grid).toHaveClass('grid-cols-3');
      expect(grid).toHaveClass('gap-6'); // corresponds to lg
    });
  });

  describe('Stack and Inline', () => {
    it('renders Stack vertically stacked', () => {
      render(<Stack data-testid="stack" spacing="xl" align="center">St</Stack>);
      const stack = screen.getByTestId('stack');
      expect(stack).toHaveClass('flex flex-col space-y-8 items-center');
    });

    it('renders Inline horizontally stacked with wrapping', () => {
      render(<Inline data-testid="inline" justify="between" wrap={true}>In</Inline>);
      const inline = screen.getByTestId('inline');
      expect(inline).toHaveClass('flex space-x-4 justify-between items-center flex-wrap');
    });
  });

  describe('Divider and Spacer', () => {
    it('renders vertical and horizontal dividers', () => {
      const { container } = render(
        <>
          <Divider label="OR" style="dashed" />
          <Divider orientation="vertical" />
        </>
      );
      expect(screen.getByText('OR')).toBeInTheDocument();
      // vertical divider verification
      const verticalDivider = container.querySelector('.border-l');
      expect(verticalDivider).toHaveClass('h-full w-px');
    });

    it('renders spacers', () => {
      const { container } = render(<Spacer size="xs" direction="horizontal" />);
      // We look for the div holding the spacer class 'w-1' which corresponds to size xs horizontally
      expect(container.firstChild).toHaveClass('w-1');
    });
  });

});
