import { describe, expect, it } from 'vitest';
import { credentialsCsv } from './portalCredentials';

describe('credentialsCsv', () => {
  it('Excel uchun BOM, sarlavha va ";" ajratkichi bilan; maxsus belgilar qo‘shtirnoqda', () => {
    const csv = credentialsCsv([
      { fullName: 'Aziz Karimov', code: 'ST-000045', groupName: 'Frontend-12', login: 'ST-000045', temporaryPassword: 'abcDEF23Aa4' },
      { fullName: 'Ali "Kichik"; Valiyev', code: 'ST-000046', groupName: null, login: 'ST-000046', temporaryPassword: 'xyz' },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('F.I.Sh;ID;Guruh;Login;Parol');
    expect(lines[1]).toBe('Aziz Karimov;ST-000045;Frontend-12;ST-000045;abcDEF23Aa4');
    expect(lines[2]).toBe('"Ali ""Kichik""; Valiyev";ST-000046;;ST-000046;xyz');
  });
});
