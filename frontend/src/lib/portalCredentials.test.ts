import { describe, expect, it } from 'vitest';
import { credentialsCsv } from './portalCredentials';

describe('credentialsCsv', () => {
  it('Excel uchun BOM, sarlavha va ";" ajratkichi bilan; maxsus belgilar qo‘shtirnoqda', () => {
    const csv = credentialsCsv([
      { fullName: 'Aziz Karimov', subtitle: 'ST-000045 · Frontend-12', login: 'ST-000045', temporaryPassword: 'abcDEF23Aa4' },
      { fullName: 'Ali "Kichik"; Valiyev', subtitle: null, login: '+998901234567', temporaryPassword: 'xyz' },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('F.I.Sh;Izoh;Login;Parol');
    expect(lines[1]).toBe('Aziz Karimov;ST-000045 · Frontend-12;ST-000045;abcDEF23Aa4');
    expect(lines[2]).toBe('"Ali ""Kichik""; Valiyev";;+998901234567;xyz');
  });
});
