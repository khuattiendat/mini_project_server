import { User } from 'src/database/entities/user.entity';

export interface IJwtPayload {
  userId: number;
  userName: string;
  role: string;
  type: 'access' | 'refresh';
}

export interface ITokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface IAuthContext {
  user: User;
  token: ITokenPair;
}
