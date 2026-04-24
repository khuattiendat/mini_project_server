import { IsNotEmpty } from 'class-validator';

export class TokenDto {
  accessToken!: string;
  refreshToken!: string;
  expiresIn!: number;
}

export class AuthResponseDto {
  userId!: number;
  userName!: string;
  fullName!: string;
  role!: string;
  status!: string;
  token!: TokenDto;
}

export class RefreshTokenDto {
  @IsNotEmpty()
  refreshToken!: string;
}

export class RefreshTokenResponseDto {
  accessToken!: string;
  refreshToken!: string;
  expiresIn!: number;
}
