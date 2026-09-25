import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrandMark } from './BrandMark';

const branding = vi.fn();
vi.mock('@/services/academySettings.service', () => ({
  academySettingsService: { branding: () => branding() },
  brandingAssetUrl: (path: string | null) => (path ? `/api${path}` : null),
}));

function renderMark() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BrandMark />
    </QueryClientProvider>,
  );
}

describe('BrandMark', () => {
  it('markaz nomi va logosi sozlamadan', async () => {
    branding.mockResolvedValue({ name: 'IT-Academy Chilonzor', logoUrl: '/public/branding/logo?v=2', currency: 'UZS', defaultLanguage: 'uz' });
    renderMark();
    expect(await screen.findByText('IT-Academy Chilonzor')).toBeInTheDocument();
    expect(document.querySelector('img')).toHaveAttribute('src', '/api/public/branding/logo?v=2');
  });

  it('logo bo‘lmasa — bosh harflar', async () => {
    branding.mockResolvedValue({ name: 'Najot Markaz', logoUrl: null, currency: 'UZS', defaultLanguage: 'uz' });
    renderMark();
    expect(await screen.findByText('NA')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});
