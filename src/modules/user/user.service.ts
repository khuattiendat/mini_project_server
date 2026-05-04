import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { FindOptionsWhere, Not, Repository } from 'typeorm';
import { User, UserRole, UserStatus } from 'src/database/entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly bcryptRounds: number;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {
    this.bcryptRounds = this.getNumberEnv('BCRYPT_ROUNDS');
  }


  async create(dto: CreateUserDto) {
    await this.ensureUniqueUserName(dto.userName);

    const user = this.userRepository.create({
      userName: dto.userName,
      password: await bcrypt.hash(dto.password, this.bcryptRounds),
      fullName: dto.fullName,
      status: dto.status ?? UserStatus.ACTIVE,
      createdAt:  new Date(),
    });

    const saved = await this.userRepository.save(user);
    this.logger.log(`User created: id=${saved.id}, userName=${saved.userName}`);
    return this.toResponse(saved);
  }

  async findAll(query: UserQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();

    const qb = this.userRepository
      .createQueryBuilder('user')
      .where('user.deletedAt IS NULL')
      .andWhere('user.role != :adminRole', { adminRole: UserRole.ADMIN });

    if (search) {
      qb.andWhere(
        '(user.userName LIKE :s OR user.fullName LIKE :s OR user.deviceId LIKE :s OR user.role LIKE :s OR user.status LIKE :s OR CAST(user.id AS CHAR) LIKE :s)',
        { s: `%${search}%` },
      );
    }

    if (query.status) {
      qb.andWhere('user.status = :status', { status: query.status });
    }

    const [items, totalItems] = await qb
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((u) => this.toResponse(u)),
      meta: this.buildMeta(page, limit, totalItems),
    };
  }

  async findOne(id: number) {
    return this.toResponse(await this.findUserOrThrow(id));
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.findUserOrThrow(id);

    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.status !== undefined) user.status = dto.status;
    if (dto.password) user.password = await bcrypt.hash(dto.password, this.bcryptRounds);

    const saved = await this.userRepository.save(user);
    this.logger.log(`User updated: id=${id}`);
    return this.toResponse(saved);
  }

  async remove(id: number) {
    await this.findUserOrThrow(id);
    await this.userRepository.softDelete(id);
    this.logger.log(`User deleted: id=${id}`);
    return { message: 'User deleted successfully' };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async findUserOrThrow(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User with id ${id} not found`);
    return user;
  }

  private async ensureUniqueUserName(userName: string, excludedId?: number): Promise<void> {
    const where: FindOptionsWhere<User> = { userName };
    if (excludedId !== undefined) where.id = Not(excludedId);

    const existing = await this.userRepository.findOne({ where });
    if (existing) throw new ConflictException(`User name ${userName} already exists`);
  }

  private buildMeta(page: number, limit: number, totalItems: number) {
    return {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      hasNextPage: page * limit < totalItems,
      hasPreviousPage: page > 1,
    };
  }

  private toResponse(user: User) {
    return {
      id: user.id,
      userName: user.userName,
      fullName: user.fullName,
      deviceId: user.deviceId,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt,
    };
  }

  private getNumberEnv(key: string): number {
    const value = this.configService.get<string>(key)?.trim();
    if (!value) throw new Error(`Missing required environment variable: ${key}`);

    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error(`Invalid numeric environment variable: ${key}`);
    }

    return parsed;
  }
}
