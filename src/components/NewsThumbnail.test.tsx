// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
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

  it('keeps a fixed visual fallback when the feed has no image', () => {
    const { container } = render(
      <NewsThumbnail
        isHero={false}
        gradient="from-red-500 to-orange-500"
        icon="local_fire_department"
      />,
    );

    expect(container).toHaveTextContent('local_fire_department');
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(thumbnailMocks.fetchNewsThumbnail).not.toHaveBeenCalled();
  });

  it('loads a remote thumbnail through the authenticated proxy and revokes its blob URL', async () => {
    thumbnailMocks.fetchNewsThumbnail.mockResolvedValue(new Blob(['image'], { type: 'image/jpeg' }));
    const { container, unmount } = render(
      <NewsThumbnail
        src="https://news.example/fire.jpg"
        isHero
        gradient="from-red-500 to-orange-500"
        icon="local_fire_department"
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

  it('returns to the visual fallback when the proxied image fails', async () => {
    thumbnailMocks.fetchNewsThumbnail.mockRejectedValue(new Error('proxy failed'));
    const { container } = render(
      <NewsThumbnail
        src="https://news.example/broken.jpg"
        isHero={false}
        gradient="from-blue-500 to-sky-500"
        icon="admin_panel_settings"
      />,
    );

    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(container).toHaveTextContent('admin_panel_settings');
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('keeps the same fallback after browser image decode failure', async () => {
    thumbnailMocks.fetchNewsThumbnail.mockResolvedValue(new Blob(['broken'], { type: 'image/jpeg' }));
    const { container } = render(
      <NewsThumbnail
        src="https://news.example/broken.jpg"
        isHero={false}
        gradient="from-blue-500 to-sky-500"
        icon="admin_panel_settings"
      />,
    );

    const image = await waitFor(() => {
      const element = container.querySelector('img');
      expect(element).toBeInTheDocument();
      return element as HTMLImageElement;
    });
    fireEvent.error(image);

    await waitFor(() => expect(container.querySelector('img')).not.toBeInTheDocument());
    expect(container).toHaveTextContent('admin_panel_settings');
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
        gradient="from-red-500 to-orange-500"
        icon="local_fire_department"
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
        gradient="from-red-500 to-orange-500"
        icon="local_fire_department"
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
