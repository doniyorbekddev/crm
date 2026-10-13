import { afterEach, describe, expect, it } from 'vitest';
import { setDomTranslator } from './domTranslator';
import { createTranslator } from './translate';

describe('sahifaga qo‘llash (DOM)', () => {
  const translate = createTranslator(new Map([['Saqlash', 'Save'], ['Qidirish…', 'Search…'], ['Yopish', 'Close'], ['Bugun', 'Today']]), [['{0} ta ochiq ish', '{0} open tasks']]);
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  afterEach(() => {
    setDomTranslator(null);
    document.body.innerHTML = '';
  });

  it('matn va atributlar tarjima qilinadi; kod, kiritish maydoni va belgilangan joylar — yo‘q', () => {
    document.body.innerHTML = `
      <button title="Yopish" aria-label="Yopish">Saqlash</button>
      <input placeholder="Qidirish…" value="Saqlash" />
      <p>3 ta ochiq ish</p><p>Ali Valiyev</p>
      <code>Saqlash</code><span data-no-translate>Saqlash</span><textarea>Saqlash</textarea>`;
    setDomTranslator(translate);

    const button = document.querySelector('button')!;
    expect(button.textContent).toBe('Save');
    expect(button.title).toBe('Close');
    expect(button.getAttribute('aria-label')).toBe('Close');
    expect(document.querySelector('input')!.placeholder).toBe('Search…');
    // Foydalanuvchi kiritgan qiymat hech qachon o'zgarmaydi
    expect(document.querySelector('input')!.value).toBe('Saqlash');
    expect(document.querySelectorAll('p')[0]!.textContent).toBe('3 open tasks');
    expect(document.querySelectorAll('p')[1]!.textContent).toBe('Ali Valiyev');
    expect(document.querySelector('code')!.textContent).toBe('Saqlash');
    expect(document.querySelector('[data-no-translate]')!.textContent).toBe('Saqlash');
    expect(document.querySelector('textarea')!.textContent).toBe('Saqlash');
  });

  it('keyin qo‘shilgan va o‘zgargan matn ham tarjima qilinadi (React yangilashlari); o‘chirilsa asl matn qaytadi', async () => {
    document.body.innerHTML = '<div id="root"><span>Saqlash</span></div>';
    setDomTranslator(translate);
    const span = document.querySelector('span')!;
    const node = span.firstChild as Text;
    expect(node.nodeValue).toBe('Save');

    // React matn tugunini yangilaydi
    node.nodeValue = 'Bugun';
    await flush();
    expect(node.nodeValue).toBe('Today');
    // Yangi element qo'shiladi
    const added = document.createElement('p');
    added.textContent = '7 ta ochiq ish';
    added.setAttribute('title', 'Yopish');
    document.getElementById('root')!.append(added);
    await flush();
    expect(added.textContent).toBe('7 open tasks');
    expect(added.title).toBe('Close');
    // Atribut keyin o'zgaradi
    added.setAttribute('title', 'Saqlash');
    await flush();
    expect(added.title).toBe('Save');

    // Tugun tuzilmasi o'zgarmagan — React ushlab turgan tugun o'sha
    expect(span.firstChild).toBe(node);
    expect(span.childNodes).toHaveLength(1);

    setDomTranslator(null);
    expect(node.nodeValue).toBe('Bugun');
    expect(added.textContent).toBe('7 ta ochiq ish');
    expect(added.title).toBe('Saqlash');
    // O'chirilgach yangi matn tarjima qilinmaydi
    node.nodeValue = 'Saqlash';
    await flush();
    expect(node.nodeValue).toBe('Saqlash');
  });

  it('tildan tilga to‘g‘ridan-to‘g‘ri o‘tish: avval asl matn tiklanadi, keyin yangi til qo‘llanadi', () => {
    document.body.innerHTML = '<span>Saqlash</span>';
    setDomTranslator(translate);
    setDomTranslator(createTranslator(new Map([['Saqlash', 'Сохранить']]), []));
    expect(document.querySelector('span')!.textContent).toBe('Сохранить');
  });
});
