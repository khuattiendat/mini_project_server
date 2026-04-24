import { ConfigService } from '@nestjs/config';

export const jwtConfigFactory = (configService: ConfigService) => {
  const secret = configService.get<string>('JWT_SECRET')?.trim();
  const accessTokenExpiration = configService
    .get<string>('JWT_ACCESS_EXPIRATION')
    ?.trim()
    .replace(/;$/, '');

  if (!secret || !accessTokenExpiration) {
    throw new Error(
      'Missing JWT configuration: JWT_SECRET or JWT_ACCESS_EXPIRATION',
    );
  }

  return {
    secret,
    signOptions: {
      expiresIn: parseDurationToSeconds(accessTokenExpiration),
    },
  };
};

export const parseDurationToSeconds = (duration: string): number => {
  const match = duration.match(/^(\d+)\s*([smhd])?$/i);

  if (!match) {
    throw new Error(`Invalid JWT_ACCESS_EXPIRATION value: ${duration}`);
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();

  const unitToSeconds: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };

  return amount * unitToSeconds[unit];
};
