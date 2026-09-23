/** `authenticate` middleware tomonidan `req.user` ga yoziladigan joriy foydalanuvchi. */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleKey: string;
  /** Xodim biriktirilgan filial — ko‘rinish doirasi va yangi yozuvlar uchun */
  branchId: string;
}
