import { ConfigModuleOptions } from '@nestjs/config';

export const envConfig: ConfigModuleOptions = {
  envFilePath: '.env',
  isGlobal: true,
};
