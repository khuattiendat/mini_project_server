import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from 'src/database/entities/user.entity';
import { RefreshToken } from 'src/database/entities/refresh-token.entity';
import { LoginDto } from './dto/login.dto';
import { SignUpDto } from './dto/signup.dto';
import { AuthResponseDto, RefreshTokenResponseDto } from './dto/auth-response.dto';
import { IJwtPayload, ITokenPair } from '../../common/interfaces/auth.interface';
import {
  InvalidCredentialsException,
  InvalidTokenException,
  RefreshTokenExpiredException,
  RefreshTokenRevokedException,
  UserAlreadyExistsException,
  UserNotActiveException,
} from '../../common/exceptions/auth.exception';
import { parseDurationToSeconds } from 'src/config/auth.config';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly bcryptRounds: number;
  private readonly accessTokenExpiresInSeconds: number;
  private readonly refreshTokenExpiresInSeconds: number;
  private readonly refreshTokenExpiresInMs: number;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret = this.getRequiredEnv('JWT_SECRET');
    this.bcryptRounds = this.getNumberEnv('BCRYPT_ROUNDS');
    this.accessTokenExpiresInSeconds = parseDurationToSeconds(this.getRequiredEnv('JWT_ACCESS_EXPIRATION'));
    this.refreshTokenExpiresInSeconds = parseDurationToSeconds(this.getRequiredEnv('JWT_REFRESH_EXPIRATION'));
    this.refreshTokenExpiresInMs = this.refreshTokenExpiresInSeconds * 1000;
  }

  // ─── Auth flows ───────────────────────────────────────────────────────────

  async signup(dto: SignUpDto): Promise<AuthResponseDto> {
    const existing = await this.userRepository.findOne({ where: { userName: dto.userName } });
    if (existing) throw new UserAlreadyExistsException(dto.userName);

    const user = this.userRepository.create({
      userName: dto.userName,
      password: await bcrypt.hash(dto.password, this.bcryptRounds),
      fullName: dto.fullName,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    });

    const saved = await this.userRepository.save(user);
    this.logger.log(`User registered: ${dto.userName}`);
    return this.buildAuthResponse(saved);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findOne({ where: { userName: dto.userName } });

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new InvalidCredentialsException();
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UserNotActiveException();
    }

    this.logger.log(`User logged in: ${dto.userName}`);
    return this.buildAuthResponse(user);
  }

  async refreshAccessToken(refreshTokenString: string): Promise<RefreshTokenResponseDto> {
    const payload = this.jwtService.verify<IJwtPayload>(refreshTokenString, {
      secret: this.jwtSecret,
    });

    if (payload.type !== 'refresh') throw new InvalidTokenException();

    const stored = await this.refreshTokenRepository.findOne({
      where: { userId: payload.userId },
      order: { createdAt: 'DESC' },
    });

    if (!stored) throw new InvalidTokenException();
    if (!(await bcrypt.compare(refreshTokenString, stored.tokenHash))) throw new InvalidTokenException();
    if (stored.isRevoked) throw new RefreshTokenRevokedException();
    if (new Date() > stored.expiresAt) throw new RefreshTokenExpiredException();

    const user = await this.userRepository.findOne({ where: { id: payload.userId } });
    if (!user) throw new InvalidTokenException();

    const newTokenPair = this.generateTokenPair(user);

    // Invalidate old token and store new one
    stored.isRevoked = true;
    await this.refreshTokenRepository.save(stored);
    await this.storeRefreshToken(user.id, newTokenPair.refreshToken);

    this.logger.log(`Token refreshed for user: ${user.userName}`);
    return {
      accessToken: newTokenPair.accessToken,
      refreshToken: newTokenPair.refreshToken,
      expiresIn: this.accessTokenExpiresInSeconds,
    };
  }

  async logout(userId: number): Promise<void> {
    await this.refreshTokenRepository.update({ userId, isRevoked: false }, { isRevoked: true });
    this.logger.log(`User logged out: id=${userId}`);
  }

  // ─── Profile ──────────────────────────────────────────────────────────────

  async getProfile(userId: number): Promise<Partial<User>> {
    const user = await this.findUserOrThrow(userId);

    if (user.status !== UserStatus.ACTIVE) {
      throw new UserNotActiveException();
    }

    return this.toProfileResponse(user);
  }

  async updateProfile(userId: number, fullName: string): Promise<Partial<User>> {
    const user = await this.findUserOrThrow(userId);
    user.fullName = fullName;
    const saved = await this.userRepository.save(user);
    return this.toProfileResponse(saved);
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.findUserOrThrow(userId);

    if (!(await bcrypt.compare(currentPassword, user.password))) {
      throw new InvalidCredentialsException();
    }

    user.password = await bcrypt.hash(newPassword, this.bcryptRounds);
    await this.userRepository.save(user);

    // Revoke all refresh tokens — force re-login on other devices
    await this.refreshTokenRepository.update({ userId, isRevoked: false }, { isRevoked: true });
    this.logger.log(`Password changed for user: id=${userId}`);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async findUserOrThrow(userId: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new InvalidCredentialsException();
    return user;
  }

  private async buildAuthResponse(user: User): Promise<AuthResponseDto> {
    const tokenPair = this.generateTokenPair(user);
    await this.storeRefreshToken(user.id, tokenPair.refreshToken);

    return {
      userId: user.id,
      userName: user.userName,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      token: {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: this.accessTokenExpiresInSeconds,
      },
    };
  }

  private generateTokenPair(user: User): ITokenPair {
    const base: IJwtPayload = {
      userId: user.id,
      userName: user.userName,
      role: user.role,
      type: 'access',
    };

    return {
      accessToken: this.jwtService.sign(base, {
        secret: this.jwtSecret,
        expiresIn: this.accessTokenExpiresInSeconds,
      }),
      refreshToken: this.jwtService.sign(
        { ...base, type: 'refresh' },
        { secret: this.jwtSecret, expiresIn: this.refreshTokenExpiresInSeconds },
      ),
      expiresIn: this.accessTokenExpiresInSeconds,
    };
  }

  private async storeRefreshToken(userId: number, refreshToken: string): Promise<void> {
    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        userId,
        tokenHash: await bcrypt.hash(refreshToken, this.bcryptRounds),
        expiresAt: new Date(Date.now() + this.refreshTokenExpiresInMs),
      }),
    );
  }

  private toProfileResponse(user: User): Partial<User> {
    return {
      id: user.id,
      userName: user.userName,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
    };
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key)?.trim().replace(/;$/, '');
    if (!value) throw new Error(`Missing required environment variable: ${key}`);
    return value;
  }

  private getNumberEnv(key: string): number {
    const parsed = Number.parseInt(this.getRequiredEnv(key), 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error(`Invalid numeric environment variable: ${key}`);
    }
    return parsed;
  }
}
