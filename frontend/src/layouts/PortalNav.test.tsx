import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PORTAL_NAV_ITEMS, PortalBottomBar, PortalTabs } from './PortalNav';

/**
 * Kabinet navigatsiyasi — o‘quvchi va ota-ona shu tugmalar orqali yuradi.
 * Ikkala ko‘rinish (tablar va pastki panel) bir xil ro‘yxatdan quriladi, shuning uchun
 * bitta bo‘lim tushib qolsa ikkalasida ham bilinadi.
 */
describe('PortalNav', () => {
  it('barcha bo‘limlar ikkala ko‘rinishda ham havola sifatida chiqadi', () => {
    render(
      <MemoryRouter initialEntries={['/portal']}>
        <PortalTabs />
        <PortalBottomBar />
      </MemoryRouter>,
    );
    const navs = screen.getAllByRole('navigation', { name: 'Kabinet bo‘limlari' });
    expect(navs).toHaveLength(2);
    for (const nav of navs) {
      for (const item of PORTAL_NAV_ITEMS) {
        expect(within(nav).getByRole('link', { name: item.label })).toHaveAttribute('href', item.to);
      }
    }
  });

  it('bosh sahifa faqat aniq yo‘lda faol, ichki bo‘limda emas', () => {
    render(
      <MemoryRouter initialEntries={['/portal/homework']}>
        <PortalTabs />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Kabinet bo‘limlari' });
    expect(within(nav).getByRole('link', { name: 'Vazifalar' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Bosh sahifa' })).not.toHaveAttribute('aria-current');
  });
});
