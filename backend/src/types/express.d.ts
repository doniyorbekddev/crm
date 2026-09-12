import type { AuthUser } from './auth.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** `authenticate` middleware’dan o‘tgan so‘rovlarda mavjud */
    user?: AuthUser;
  }
}
