import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignUpDto } from './dto/signup.dto';
import { RefreshTokenDto } from './dto/auth-response.dto';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { User } from 'src/database/entities/user.entity';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() signUpDto: SignUpDto) {
    this.logger.log(`Sign up request for user: ${signUpDto.userName}`);
    return this.authService.signup(signUpDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    this.logger.log(`Login request for user: ${loginDto.userName}`);
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    this.logger.log('Refresh token request');
    return this.authService.refreshAccessToken(refreshTokenDto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: User) {
    this.logger.log(`Logout request for user: ${user.id}`);
    await this.authService.logout(user.id);
    return { message: 'Logout successful' };
  }

  @Get('me')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  async getProfile(@CurrentUser() user: User) {
    this.logger.log(`Profile request for user: ${user.id}`);
    const { id } = user;
    return this.authService.getProfile(id);
  }
}
