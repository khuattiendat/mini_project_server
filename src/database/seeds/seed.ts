import { AppDataSource } from '../data-source';
import { seedAdmin } from './seed.admin';

async function bootstrap() {
  await AppDataSource.initialize();
  console.log('🌱 Seeding database...');

  await seedAdmin(AppDataSource);

  await AppDataSource.destroy();
  console.log('✅ Seeding done');
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
