import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from 'src/database/entities/user.entity';
import { RefreshToken } from 'src/database/entities/refresh-token.entity';
import { LoginDto } from './dto/login.dto';
import { SignUpDto } from './dto/signup.dto';
import {
  AuthResponseDto,
  RefreshTokenResponseDto,
} from './dto/auth-response.dto';
import {
  IJwtPayload,
  ITokenPair,
} from '../../common/interfaces/auth.interface';
import {
  InvalidCredentialsException,
  UserAlreadyExistsException,
  UserNotActiveException,
  InvalidTokenException,
  RefreshTokenRevokedException,
  RefreshTokenExpiredException,
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
    const accessTokenExpiration = this.getRequiredEnv('JWT_ACCESS_EXPIRATION');
    const refreshTokenExpiration = this.getRequiredEnv(
      'JWT_REFRESH_EXPIRATION',
    );
    this.bcryptRounds = this.getNumberEnv('BCRYPT_ROUNDS');

    this.accessTokenExpiresInSeconds = parseDurationToSeconds(
      accessTokenExpiration,
    );
    this.refreshTokenExpiresInSeconds = parseDurationToSeconds(
      refreshTokenExpiration,
    );
    this.refreshTokenExpiresInMs = this.refreshTokenExpiresInSeconds * 1000;
  }

  async signup(signUpDto: SignUpDto): Promise<AuthResponseDto> {
    const { userName, password, fullName } = signUpDto;

    const existingUser = await this.userRepository.findOne({
      where: { userName },
    });

    if (existingUser) {
      throw new UserAlreadyExistsException(userName);
    }

    const hashedPassword = await bcrypt.hash(password, this.bcryptRounds);

    const user = this.userRepository.create({
      userName,
      password: hashedPassword,
      fullName,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    });

    const savedUser = await this.userRepository.save(user);
    this.logger.log(`New user registered: ${userName}`);

    return this.buildAuthResponse(savedUser);
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { userName, password } = loginDto;

    const user = await this.userRepository.findOne({
      where: { userName },
    });

    if (!user) {
      throw new InvalidCredentialsException();
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      throw new InvalidCredentialsException();
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UserNotActiveException();
    }

    this.logger.log(`User logged in: ${userName}`);
    return this.buildAuthResponse(user);
  }

  async refreshAccessToken(
    refreshTokenString: string,
  ): Promise<RefreshTokenResponseDto> {
    // Verify refresh token
    const payload = this.jwtService.verify<IJwtPayload>(refreshTokenString, {
      secret: this.jwtSecret,
    });

    if (payload.type !== 'refresh') {
      throw new InvalidTokenException();
    }

    // Find stored refresh token
    const storedToken = await this.refreshTokenRepository.findOne({
      where: { userId: payload.userId },
      order: { createdAt: 'DESC' },
    });

    if (!storedToken) {
      throw new InvalidTokenException();
    }

    // Verify token hash
    const tokenMatches = await bcrypt.compare(
      refreshTokenString,
      storedToken.tokenHash,
    );
    if (!tokenMatches) {
      throw new InvalidTokenException();
    }

    // Check if revoked
    if (storedToken.isRevoked) {
      throw new RefreshTokenRevokedException();
    }

    // Check if expired
    if (new Date() > storedToken.expiresAt) {
      throw new RefreshTokenExpiredException();
    }

    // Get user
    const user = await this.userRepository.findOne({
      where: { id: payload.userId },
    });
    if (!user) {
      throw new InvalidTokenException();
    }

    // Generate new token pair
    const newTokenPair = this.generateTokenPair(user);

    // Invalidate old refresh token
    storedToken.isRevoked = true;
    await this.refreshTokenRepository.save(storedToken);

    // Store new refresh token
    await this.storeRefreshToken(user.id, newTokenPair.refreshToken);

    this.logger.log(`Token refreshed for user: ${user.userName}`);

    return {
      accessToken: newTokenPair.accessToken,
      refreshToken: newTokenPair.refreshToken,
      expiresIn: this.accessTokenExpiresInSeconds,
    };
  }

  async logout(userId: number): Promise<void> {
    // Revoke all refresh tokens for user
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
    this.logger.log(`User logged out: ${userId}`);
  }
  async getProfile(userId: number): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new InvalidCredentialsException();
    }
    return {
      id: user.id,
      userName: user.userName,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
    };
  }

  async updateProfile(
    userId: number,
    fullName: string,
  ): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new InvalidCredentialsException();
    }

    user.fullName = fullName;
    const saved = await this.userRepository.save(user);

    return {
      id: saved.id,
      userName: saved.userName,
      fullName: saved.fullName,
      role: saved.role,
      status: saved.status,
    };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new InvalidCredentialsException();
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!passwordMatches) {
      throw new InvalidCredentialsException();
    }

    user.password = await bcrypt.hash(newPassword, this.bcryptRounds);
    await this.userRepository.save(user);

    // Revoke all refresh tokens to force re-login on other devices
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );

    this.logger.log(`Password changed for user: ${userId}`);
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
    const payload: IJwtPayload = {
      userId: user.id,
      userName: user.userName,
      role: user.role,
      type: 'access',
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.jwtSecret,
      expiresIn: this.accessTokenExpiresInSeconds,
    });

    const refreshPayload: IJwtPayload = {
      ...payload,
      type: 'refresh',
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.jwtSecret,
      expiresIn: this.refreshTokenExpiresInSeconds,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenExpiresInSeconds,
    };
  }

  private async storeRefreshToken(
    userId: number,
    refreshToken: string,
  ): Promise<void> {
    const tokenHash = await bcrypt.hash(refreshToken, this.bcryptRounds);
    const expiresAt = new Date(Date.now() + this.refreshTokenExpiresInMs);

    const refreshTokenEntity = this.refreshTokenRepository.create({
      userId,
      tokenHash,
      expiresAt,
    });

    await this.refreshTokenRepository.save(refreshTokenEntity);
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);
    const sanitized = this.sanitizeEnvValue(value);

    if (!sanitized) {
      throw new Error(`Missing required environment variable: ${key}`);
    }

    return sanitized;
  }

  private getNumberEnv(key: string): number {
    const value = this.getRequiredEnv(key);
    const parsed = Number.parseInt(value, 10);

    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error(`Invalid numeric environment variable: ${key}`);
    }

    return parsed;
  }

  private sanitizeEnvValue(value: string | undefined): string {
    if (!value) {
      return '';
    }

    return value.trim().replace(/;$/, '');
  }
}
