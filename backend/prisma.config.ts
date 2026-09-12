import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 .env faylini avtomatik o‘qimaydi.
config({ quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // `prisma generate` uchun URL shart emas, shuning uchun env() (majburiy) o‘rniga process.env ishlatiladi.
  datasource: {
    url: process.env.DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
