import React from 'react';
import { render } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Container,
  Grid,
  Stack,
  Inline
} from './Layout';
import { Divider, Spacer } from './Layout';

// Card
it('renderiza Card con props por defecto', () => {
  const { container } = render(<Card>Contenido</Card>);
  expect(container.firstChild).toHaveClass('bg-neutral-200');
  expect(container.firstChild).toHaveClass('rounded-md');
  expect(container.firstChild).toHaveClass('shadow-md');
});

it('renderiza Card variante modal sin shadow y con border', () => {
  const { container } = render(
    <Card variant="modal" shadow={false} border>Contenido</Card>
  );
  expect(container.firstChild).toHaveClass('bg-white');
  expect(container.firstChild).toHaveClass('rounded-lg');
  expect(container.firstChild).not.toHaveClass('shadow-lg');
  expect(container.firstChild).toHaveClass('border');
});

// CardHeader
it('renderiza CardHeader con title, subtitle y actions', () => {
  const { getByText } = render(
    <CardHeader title="Título" subtitle="Subtítulo" actions={<button>Acción</button>} />
  );
  expect(getByText('Título')).toBeInTheDocument();
  expect(getByText('Subtítulo')).toBeInTheDocument();
  expect(getByText('Acción')).toBeInTheDocument();
});

it('renderiza CardHeader solo con children', () => {
  const { getByText } = render(<CardHeader>Contenido</CardHeader>);
  expect(getByText('Contenido')).toBeInTheDocument();
});

// CardContent
it('renderiza CardContent con children', () => {
  const { getByText } = render(<CardContent>Contenido</CardContent>);
  expect(getByText('Contenido')).toBeInTheDocument();
});

// CardFooter
it('renderiza CardFooter con align right', () => {
  const { container } = render(<CardFooter align="right">Pie</CardFooter>);
  expect(container.firstChild).toHaveClass('justify-end');
});

it('renderiza CardFooter con align center', () => {
  const { container } = render(<CardFooter align="center">Pie</CardFooter>);
  expect(container.firstChild).toHaveClass('justify-center');
});

// Container
it('renderiza Container con padding md', () => {
  const { container } = render(<Container padding="md">Contenedor</Container>);
  expect(container.firstChild).toHaveClass('px-6');
});

it('renderiza Container como section', () => {
  const { container } = render(<Container as="section">Contenedor</Container>);
  expect(container.firstChild.tagName).toBe('SECTION');
});

// Grid
it('renderiza Grid con cols 3 y gap lg', () => {
  const { container } = render(<Grid cols={3} gap="lg">Grid</Grid>);
  expect(container.firstChild).toHaveClass('grid-cols-3');
  expect(container.firstChild).toHaveClass('gap-6');
});

it('renderiza Grid con responsive', () => {
  const { container } = render(<Grid responsive={{ md: 4, xl: 6 }}>Grid</Grid>);
  expect(container.firstChild.className).toMatch(/md:grid-cols-4/);
  expect(container.firstChild.className).toMatch(/xl:grid-cols-6/);
});

// Stack
it('renderiza Stack con spacing xl y align center', () => {
  const { container } = render(<Stack spacing="xl" align="center">Stack</Stack>);
  expect(container.firstChild).toHaveClass('space-y-8');
  expect(container.firstChild).toHaveClass('items-center');
});

// Inline
it('renderiza Inline con spacing xs, justify between y align end', () => {
  const { container } = render(<Inline spacing="xs" justify="between" align="end">Inline</Inline>);
  expect(container.firstChild).toHaveClass('space-x-1');
  expect(container.firstChild).toHaveClass('justify-between');
  expect(container.firstChild).toHaveClass('items-end');
});

// Divider
it('renderiza Divider horizontal con label', () => {
  const { getByText } = render(<Divider label="Divisor" />);
  expect(getByText('Divisor')).toBeInTheDocument();
});

it('renderiza Divider vertical sin label', () => {
  const { container } = render(<Divider orientation="vertical" />);
  expect(container.firstChild).toHaveClass('h-full');
  expect(container.firstChild).toHaveClass('w-px');
});

it('renderiza Divider con estilo dashed', () => {
  const { container } = render(<Divider style="dashed" />);
  expect(container.firstChild).toHaveClass('border-dashed');
});

// Spacer
it('renderiza Spacer vertical tamaño xl', () => {
  const { container } = render(<Spacer size="xl" direction="vertical" />);
  expect(container.firstChild).toHaveClass('h-8');
});

it('renderiza Spacer horizontal tamaño 2xl', () => {
  const { container } = render(<Spacer size="2xl" direction="horizontal" />);
  expect(container.firstChild).toHaveClass('w-12');
});