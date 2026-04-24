import { Injectable, Logger, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtGuard.name);

  handleRequest(err, user, info, context: ExecutionContext) {
    if (err || !user) {
      this.logger.warn(
        `Authentication failed: ${info?.message || err?.message}`,
      );
    }
    return super.handleRequest(err, user, info, context);
  }
}
