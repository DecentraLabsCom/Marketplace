import { render } from '@testing-library/react';
import { CalendarSkeleton, LabHeroSkeleton } from '../DetailsSkeleton';

describe('CalendarSkeleton', () => {
  it('renderiza header, días y celdas', () => {
    const { container } = render(<CalendarSkeleton />);
    // Header: 2 flechas (w-6), 1 mes/año (w-32)
    expect(container.querySelectorAll('.w-6')).toHaveLength(2);
    expect(container.querySelectorAll('.w-32')).toHaveLength(1);
    // Días de la semana
    expect(container.querySelectorAll('.w-8.h-6')).toHaveLength(7);
    // Celdas de días
    expect(container.querySelectorAll('.w-8.h-8')).toHaveLength(35);
  });
});

describe('LabHeroSkeleton', () => {
  it('renderiza hero skeleton completo', () => {
    const { container } = render(<LabHeroSkeleton />);
    // Título
    expect(container.getElementsByClassName('w-3/4').length).toBe(1);
    expect(container.getElementsByClassName('h-8').length).toBeGreaterThanOrEqual(1);
    // Proveedor
    expect(container.getElementsByClassName('w-5').length).toBeGreaterThanOrEqual(1);
    expect(container.getElementsByClassName('h-5').length).toBeGreaterThanOrEqual(2);
    expect(container.getElementsByClassName('w-40').length).toBe(1);
    // Descripción
    expect(container.getElementsByClassName('w-full').length).toBeGreaterThanOrEqual(1);
    expect(container.getElementsByClassName('h-4').length).toBeGreaterThanOrEqual(3);
    expect(container.getElementsByClassName('w-5/6').length).toBe(1);
    expect(container.getElementsByClassName('w-4/5').length).toBe(1);
    // Tags
    expect(container.getElementsByClassName('w-16').length).toBe(1);
    expect(container.getElementsByClassName('w-20').length).toBe(1);
    expect(container.getElementsByClassName('w-18').length).toBe(1);
    expect(container.getElementsByClassName('h-6').length).toBeGreaterThanOrEqual(3);
    // Imagen principal
    expect(container.getElementsByClassName('h-64').length).toBe(1);
    expect(container.getElementsByClassName('w-full').length).toBeGreaterThanOrEqual(2);
  });
});
