// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const thumbnailMocks = vi.hoisted(() => ({
  fetchNewsThumbnail: vi.fn(),
}));

vi.mock('../services/newsApi', () => ({
  fetchNewsThumbnail: thumbnailMocks.fetchNewsThumbnail,
}));

import NewsThumbnail from './NewsThumbnail';

describe('NewsThumbnail', () => {
  const createObjectURL = vi.fn(() => 'blob:https://119.teemozipsa.com/news-image');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    thumbnailMocks.fetchNewsThumbnail.mockReset();
    createObjectURL.mockReset();
    createObjectURL.mockReturnValue('blob:https://119.teemozipsa.com/news-image');
    revokeObjectURL.mockClear();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not reserve a media area when the feed has no image', () => {
    const { container } = render(
      <NewsThumbnail isHero={false} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(thumbnailMocks.fetchNewsThumbnail).not.toHaveBeenCalled();
  });

  it('shows a neutral skeleton only while an available image is loading', () => {
    thumbnailMocks.fetchNewsThumbnail.mockImplementation(() => new Promise(() => undefined));

    render(
      <NewsThumbnail
        src="https://news.example/fire.jpg"
        isHero
      />,
    );

    expect(screen.getByTestId('news-thumbnail-loading')).toBeInTheDocument();
    expect(screen.queryByText('local_fire_department')).not.toBeInTheDocument();
  });

  it('loads a remote thumbnail through the authenticated proxy and revokes its blob URL', async () => {
    thumbnailMocks.fetchNewsThumbnail.mockResolvedValue(new Blob(['image'], { type: 'image/jpeg' }));
    const { container, unmount } = render(
      <NewsThumbnail
        src="https://news.example/fire.jpg"
        isHero
      />,
    );

    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'blob:https://119.teemozipsa.com/news-image',
    ));
    expect(thumbnailMocks.fetchNewsThumbnail).toHaveBeenCalledWith(
      'https://news.example/fire.jpg',
      expect.any(AbortSignal),
    );

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:https://119.teemozipsa.com/news-image');
  });

  it('removes the media area when the proxied image fails', async () => {
    thumbnailMocks.fetchNewsThumbnail.mockRejectedValue(new Error('proxy failed'));
    const { container } = render(
      <NewsThumbnail
        src="https://news.example/broken.jpg"
        isHero={false}
      />,
    );

    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('removes the media area after browser image decode failure', async () => {
    thumbnailMocks.fetchNewsThumbnail.mockResolvedValue(new Blob(['broken'], { type: 'image/jpeg' }));
    const { container } = render(
      <NewsThumbnail
        src="https://news.example/broken.jpg"
        isHero={false}
      />,
    );

    const image = await waitFor(() => {
      const element = container.querySelector('img');
      expect(element).toBeInTheDocument();
      return element as HTMLImageElement;
    });
    fireEvent.error(image);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:https://119.teemozipsa.com/news-image');
  });

  it('top-biases portrait photos so faces are less likely to be cropped', async () => {
    thumbnailMocks.fetchNewsThumbnail.mockResolvedValue(new Blob(['portrait'], { type: 'image/jpeg' }));
    const { container } = render(
      <NewsThumbnail
        src="https://news.example/portrait.jpg"
        isHero={false}
      />,
    );

    const image = await waitFor(() => {
      const element = container.querySelector('img');
      expect(element).toBeInTheDocument();
      return element as HTMLImageElement;
    });
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 500 },
      naturalHeight: { configurable: true, value: 648 },
    });
    fireEvent.load(image);

    await waitFor(() => expect(image).toHaveStyle({ objectPosition: 'center 20%' }));
  });

  it('revokes the previous object URL when the source changes', async () => {
    thumbnailMocks.fetchNewsThumbnail.mockResolvedValue(new Blob(['image'], { type: 'image/jpeg' }));
    createObjectURL
      .mockReturnValueOnce('blob:https://119.teemozipsa.com/first')
      .mockReturnValueOnce('blob:https://119.teemozipsa.com/second');

    const { container, rerender } = render(
      <NewsThumbnail
        src="https://news.example/first.jpg"
        isHero
      />,
    );
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'blob:https://119.teemozipsa.com/first',
    ));

    rerender(
      <NewsThumbnail
        src="https://news.example/second.jpg"
        isHero
      />,
    );

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith(
      'blob:https://119.teemozipsa.com/first',
    ));
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'blob:https://119.teemozipsa.com/second',
    ));
  });
});
