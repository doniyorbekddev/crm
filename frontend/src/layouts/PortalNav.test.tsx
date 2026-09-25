import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PORTAL_NAV_ITEMS, PortalBottomBar, PortalTabs } from './PortalNav';

/**
 * Kabinet navigatsiyasi — o‘quvchi va ota-ona shu tugmalar orqali yuradi.
 * Kompyuterda hamma bo‘lim tablarda; telefonda 4 tasi pastki panelda, qolgani "Yana" ichida.
 * Bitta bo‘lim tushib qolsa — test yiqiladi.
 */
describe('PortalNav', () => {
  it('kompyuter tablarida barcha bo‘limlar havola sifatida chiqadi', () => {
    render(
      <MemoryRouter initialEntries={['/portal']}>
        <PortalTabs />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Kabinet bo‘limlari' });
    for (const item of PORTAL_NAV_ITEMS) {
      expect(within(nav).getByRole('link', { name: item.label })).toHaveAttribute('href', item.to);
    }
  });

  it('telefonda asosiy bo‘limlar panelda, qolganlari "Yana" menyusida — hammasi yetib boriladi', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/portal']}>
        <PortalBottomBar />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Kabinet bo‘limlari' });
    const primary = PORTAL_NAV_ITEMS.filter((item) => item.primary);
    const secondary = PORTAL_NAV_ITEMS.filter((item) => !item.primary);
    for (const item of primary) expect(within(nav).getByRole('link', { name: item.label })).toHaveAttribute('href', item.to);
    expect(within(nav).queryByRole('link', { name: secondary[0]!.label })).not.toBeInTheDocument();

    const more = within(nav).getByRole('button', { name: 'Yana' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    for (const item of secondary) expect(within(nav).getByRole('link', { name: item.label })).toHaveAttribute('href', item.to);

    await user.keyboard('{Escape}');
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });

  it('bosh sahifa faqat aniq yo‘lda faol; ichki bo‘limda "Yana" faol ko‘rinadi', () => {
    render(
      <MemoryRouter initialEntries={['/portal/payments']}>
        <PortalTabs />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Kabinet bo‘limlari' });
    expect(within(nav).getByRole('link', { name: 'To‘lovlar' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Bosh sahifa' })).not.toHaveAttribute('aria-current');
  });
});
