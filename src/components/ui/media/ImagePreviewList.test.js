import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import ImagePreviewList from './ImagePreviewList';

// Mock MediaDisplayWithFallback
jest.mock('@/components/ui/media/MediaDisplayWithFallback', () => ({
  __esModule: true,
  default: ({ mediaPath, alt }) => <img src={mediaPath} alt={alt} data-testid="media-fallback" />
}));

describe('ImagePreviewList', () => {
  const images = ['img1.jpg', 'img2.jpg', 'img3.jpg'];
  const removeImage = jest.fn();

  it('renderiza la grid con todas las imágenes', () => {
    const { getAllByTestId } = render(<ImagePreviewList imageUrls={images} removeImage={removeImage} />);
    expect(getAllByTestId('media-fallback')).toHaveLength(3);
  });

  it('renderiza el botón de eliminar para cada imagen', () => {
    const { container } = render(<ImagePreviewList imageUrls={images} removeImage={removeImage} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(3);
    buttons.forEach(btn => expect(btn).toBeEnabled());
  });

  it('llama a removeImage con el índice correcto al hacer click', () => {
    const { container } = render(<ImagePreviewList imageUrls={images} removeImage={removeImage} />);
    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[1]);
    expect(removeImage).toHaveBeenCalledWith(1);
  });

  it('deshabilita el botón si isExternalURI es true', () => {
    const { container } = render(<ImagePreviewList imageUrls={images} removeImage={removeImage} isExternalURI />);
    const buttons = container.querySelectorAll('button');
    buttons.forEach(btn => expect(btn).toBeDisabled());
  });

  it('renderiza correctamente con imageUrls vacío', () => {
    const { container } = render(<ImagePreviewList imageUrls={[]} removeImage={removeImage} />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('renderiza correctamente con una sola imagen', () => {
    const { getAllByTestId } = render(<ImagePreviewList imageUrls={["img1.jpg"]} removeImage={removeImage} />);
    expect(getAllByTestId('media-fallback')).toHaveLength(1);
  });

  it('el alt de la imagen es correcto', () => {
    const { getAllByTestId } = render(<ImagePreviewList imageUrls={images} removeImage={removeImage} />);
    getAllByTestId('media-fallback').forEach((img, idx) => {
      expect(img).toHaveAttribute('alt', `Preview ${idx}`);
    });
  });
});