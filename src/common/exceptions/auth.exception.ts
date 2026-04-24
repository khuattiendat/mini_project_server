import { HttpException, HttpStatus } from '@nestjs/common';

abstract class AuthHttpException extends HttpException {
  protected constructor(message: string, status: HttpStatus) {
    super(message, status);
  }
}

export class InvalidCredentialsException extends AuthHttpException {
  constructor() {
    super('Invalid username or password', HttpStatus.UNAUTHORIZED);
  }
}

export class UserAlreadyExistsException extends AuthHttpException {
  constructor(userName: string) {
    super(`User "${userName}" already exists`, HttpStatus.BAD_REQUEST);
  }
}

export class UserNotActiveException extends AuthHttpException {
  constructor() {
    super('User account is inactive', HttpStatus.FORBIDDEN);
  }
}

export class InvalidTokenException extends AuthHttpException {
  constructor() {
    super('Invalid or expired token', HttpStatus.UNAUTHORIZED);
  }
}

export class RefreshTokenRevokedException extends AuthHttpException {
  constructor() {
    super('Refresh token has been revoked', HttpStatus.UNAUTHORIZED);
  }
}

export class RefreshTokenExpiredException extends AuthHttpException {
  constructor() {
    super('Refresh token has expired', HttpStatus.UNAUTHORIZED);
  }
}
