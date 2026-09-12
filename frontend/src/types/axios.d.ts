import 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** 401 javobida tokenni yangilab qayta urinmaslik (login, refresh kabi so‘rovlar uchun) */
    skipAuthRefresh?: boolean;
    /** Ichki belgi: so‘rov token yangilangandan keyin allaqachon qayta yuborilgan */
    authRetried?: boolean;
  }
}
