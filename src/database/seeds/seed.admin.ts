import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from '../entities/user.entity';

type BcryptHash = {
  hash(data: string, saltOrRounds: number): Promise<string>;
};

export async function seedAdmin(dataSource: DataSource) {
  const userRepo = dataSource.getRepository(User);

  const userName = process.env.SEED_ADMIN_USERNAME || 'admin';
  const passwordText = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const password = await (bcrypt as unknown as BcryptHash).hash(
    passwordText,
    10,
  );
  const fullName = process.env.SEED_ADMIN_FULLNAME || 'Admin';

  const exists = await userRepo.findOne({ where: { userName } });
  if (exists) {
    userRepo.merge(exists, {
      password,
      fullName,
      userName,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    await userRepo.save(exists);
    console.log('✔ Admin user already exists, updated role and status');
    return;
  }

  await userRepo.save(
    userRepo.create({
      userName,
      password,
      fullName,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    }),
  );

  console.log('✔ Admin user created');
}
