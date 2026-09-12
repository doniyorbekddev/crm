export interface ErrorDetail {
  field?: string;
  message: string;
}

/**
 * Kutilgan (biznes) xatoliklar uchun yagona klass.
 * Service va controllerlar faqat shu klassni tashlaydi, markaziy error handler
 * uni `{ success: false, message, errors }` formatiga o‘giradi.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly errors: ErrorDetail[];

  constructor(statusCode: number, message: string, errors: ErrorDetail[] = []) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
  }

  static badRequest(message = 'So‘rov noto‘g‘ri', errors: ErrorDetail[] = []): AppError {
    return new AppError(400, message, errors);
  }

  static unauthorized(message = 'Tizimga kirish talab qilinadi'): AppError {
    return new AppError(401, message);
  }

  static forbidden(message = 'Bu amalni bajarish uchun ruxsatingiz yo‘q'): AppError {
    return new AppError(403, message);
  }

  static notFound(message = 'Ma’lumot topilmadi'): AppError {
    return new AppError(404, message);
  }

  static conflict(message = 'Bunday ma’lumot allaqachon mavjud', errors: ErrorDetail[] = []): AppError {
    return new AppError(409, message, errors);
  }

  static unprocessable(message = 'Kiritilgan ma’lumotlar noto‘g‘ri', errors: ErrorDetail[] = []): AppError {
    return new AppError(422, message, errors);
  }

  static tooManyRequests(message = 'Juda ko‘p so‘rov yuborildi. Birozdan keyin qayta urinib ko‘ring.'): AppError {
    return new AppError(429, message);
  }
}
