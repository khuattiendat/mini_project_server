import {
  ConflictException,
  Injectable,
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
  private readonly bcryptRounds: number;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {
    this.bcryptRounds = this.getNumberEnv('BCRYPT_ROUNDS');
  }

  async create(createUserDto: CreateUserDto) {
    await this.ensureUniqueUserName(createUserDto.userName);

    const user = this.userRepository.create({
      userName: createUserDto.userName,
      password: await bcrypt.hash(createUserDto.password, this.bcryptRounds),
      fullName: createUserDto.fullName,
      status: createUserDto.status ?? UserStatus.ACTIVE,
    });

    const savedUser = await this.userRepository.save(user);

    return this.toResponse(savedUser);
  }

  async findAll(query: UserQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();

    const qb = this.userRepository.createQueryBuilder('user');
    qb.andWhere('user.deletedAt IS NULL');
    qb.andWhere('user.role != :adminRole', { adminRole: UserRole.ADMIN });

    if (search) {
      const searchTerm = `%${search}%`;

      qb.andWhere(
        '(user.userName LIKE :searchTerm OR user.fullName LIKE :searchTerm OR user.deviceId LIKE :searchTerm OR user.role LIKE :searchTerm OR user.status LIKE :searchTerm OR CAST(user.id AS CHAR) LIKE :searchRaw)',
        {
          searchTerm,
          searchRaw: searchTerm,
        },
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
      items: items.map((user) => this.toResponse(user)),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        hasNextPage: page * limit < totalItems,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: number) {
    const user = await this.findUserOrThrow(id);

    return this.toResponse(user);
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.findUserOrThrow(id);

    if (updateUserDto.fullName !== undefined) {
      user.fullName = updateUserDto.fullName;
    }

    if (updateUserDto.status !== undefined) {
      user.status = updateUserDto.status;
    }

    if (updateUserDto.password) {
      user.password = await bcrypt.hash(
        updateUserDto.password,
        this.bcryptRounds,
      );
    }

    const savedUser = await this.userRepository.save(user);

    return this.toResponse(savedUser);
  }

  async remove(id: number) {
    await this.findUserOrThrow(id);
    await this.userRepository.softDelete(id);

    return {
      message: 'User deleted successfully',
    };
  }

  private async ensureUniqueUserName(
    userName: string,
    excludedId?: number,
  ): Promise<void> {
    const where: FindOptionsWhere<User> = { userName };

    if (excludedId !== undefined) {
      where.id = Not(excludedId);
    }

    const existingUser = await this.userRepository.findOne({ where });

    if (existingUser) {
      throw new ConflictException(`User name ${userName} already exists`);
    }
  }

  private async findUserOrThrow(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    return user;
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

    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }

    const parsed = Number.parseInt(value, 10);

    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error(`Invalid numeric environment variable: ${key}`);
    }

    return parsed;
  }
}
