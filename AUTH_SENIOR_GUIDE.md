# Auth Module - Senior Pattern Documentation

## Architecture Overview

The Auth module implements industry-standard authentication and authorization patterns with:

- **JWT Token Pair**: AccessToken (15m) + RefreshToken (7d) for security
- **Token Rotation**: Refresh tokens are invalidated after use
- **Role-Based Access Control (RBAC)**: Fine-grained permission management
- **Logging & Monitoring**: All authentication events are logged
- **Error Handling**: Custom exceptions for different scenarios

## Module Structure

```
src/auth/
├── auth.module.ts              # Main module definition
├── auth.service.ts             # Business logic layer
├── auth.controller.ts          # HTTP endpoints
├── index.ts                    # Public exports
├── decorators/
│   ├── current-user.decorator.ts    # @CurrentUser - Inject logged-in user
│   └── roles.decorator.ts           # @Roles - Define required roles
├── guards/
│   ├── jwt.guard.ts           # JWT token validation
│   └── roles.guard.ts         # Role authorization
├── strategies/
│   └── jwt.strategy.ts        # Passport JWT strategy
├── dtos/
│   ├── login.dto.ts
│   ├── signup.dto.ts
│   └── auth-response.dto.ts
├── interfaces/
│   └── auth.interface.ts      # Type definitions
└── exceptions/
    └── auth.exception.ts      # Custom exceptions
```

## API Endpoints

### 1. Sign Up (Register)

```
POST /auth/signup
Content-Type: application/json

Request:
{
  "userName": "john_doe",
  "password": "SecurePass123",
  "fullName": "John Doe"
}

Response (201 Created):
{
  "userId": 1,
  "userName": "john_doe",
  "fullName": "John Doe",
  "role": "user",
  "status": "active",
  "token": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  }
}
```

### 2. Login

```
POST /auth/login
Content-Type: application/json

Request:
{
  "userName": "john_doe",
  "password": "SecurePass123"
}

Response (200 OK):
{
  "userId": 1,
  "userName": "john_doe",
  "fullName": "John Doe",
  "role": "user",
  "status": "active",
  "token": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresIn": 900
  }
}
```

### 3. Refresh Access Token

```
POST /auth/refresh
Content-Type: application/json

Request:
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

Response (200 OK):
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}

Notes:
- Old refresh token is automatically revoked
- New token pair is returned
- Old token cannot be used again (prevents token hijacking)
```

### 4. Logout

```
POST /auth/logout
Authorization: Bearer {accessToken}

Response (200 OK):
{
  "message": "Logout successful"
}

Notes:
- Revokes all refresh tokens for the user
- User must login again to get new tokens
```

### 5. Get Current User Profile

```
GET /auth/me
Authorization: Bearer {accessToken}

Response (200 OK):
{
  "id": 1,
  "userName": "john_doe",
  "fullName": "John Doe",
  "role": "user",
  "status": "active"
}
```

## Usage in Controllers

### Basic Authentication - Protect Route

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guards/jwt.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { User } from 'src/database/entities/user.entity';

@Controller('exams')
@UseGuards(JwtGuard) // Requires valid JWT token
export class ExamController {
  @Get()
  getExams(@CurrentUser() user: User) {
    // user automatically injected from JWT payload
    return {
      message: `Exams for user ${user.userName}`,
      userId: user.id,
    };
  }
}
```

### Role-Based Access Control (Authorization)

```typescript
import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guards/jwt.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { User, UserRole } from 'src/database/entities/user.entity';

@Controller('exams')
@UseGuards(JwtGuard, RolesGuard) // Chain guards for full protection
export class ExamController {
  @Post()
  @Roles(UserRole.ADMIN) // Only ADMIN can create
  createExam(@CurrentUser() user: User) {
    return {
      message: `Exam created by admin ${user.userName}`,
    };
  }

  @Post(':id/publish')
  @Roles(UserRole.ADMIN) // Single role
  publishExam(@CurrentUser() user: User) {
    return { message: 'Exam published' };
  }

  @Post(':id/archive')
  @Roles(UserRole.ADMIN, UserRole.USER) // Multiple roles allowed
  archiveExam(@CurrentUser() user: User) {
    return { message: 'Exam archived' };
  }

  @Post(':id/delete')
  @Roles(UserRole.ADMIN) // Admin only
  deleteExam(@CurrentUser() user: User) {
    return { message: 'Exam deleted' };
  }
}
```

### Routes Without Authorization

```typescript
@Get('public-info')
// No @UseGuards() = publicly accessible
getPublicInfo() {
  return { message: 'Public data' };
}
```

## Decorators Reference

### @CurrentUser()

Automatically injects the authenticated user from JWT payload.

```typescript
@Get('profile')
getProfile(@CurrentUser() user: User) {
  return user;  // { id, userName, password, fullName, role, status, deviceId, etc. }
}
```

**Properties available:**

- `id`: User ID
- `userName`: Unique username
- `fullName`: Full name
- `role`: User role (admin/user)
- `status`: Account status (active/inactive)
- `deviceId`: Optional device identifier
- `createdAt`, `updatedAt`, `deletedAt`: Timestamps

### @Roles(...roles: UserRole[])

Specify which roles are allowed to access the route. Requires `RolesGuard`.

```typescript
// Single role
@Roles(UserRole.ADMIN)
deleteExam() { }

// Multiple roles
@Roles(UserRole.ADMIN, UserRole.USER)
viewExam() { }

// No @Roles() = allows all authenticated users
@Get()
@UseGuards(JwtGuard)
getExams() { }  // Any authenticated user
```

## Guards Reference

### @UseGuards(JwtGuard)

Validates JWT token in `Authorization: Bearer {token}` header.

**Behavior:**

- ✅ Valid token → User injected into request
- ❌ Missing token → 401 Unauthorized
- ❌ Invalid token → 401 Unauthorized
- ❌ Expired token → 401 Unauthorized
- ❌ Refresh token (wrong type) → 401 Unauthorized

**Request Header:**

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### @UseGuards(RolesGuard)

Validates user role against `@Roles()` decorator. Requires `JwtGuard` first.

**Must be used with @Roles() decorator:**

```typescript
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN)
createExam() { }
```

**Behavior:**

- ✅ User role matches @Roles() → Allowed
- ❌ User role not in @Roles() → 403 Forbidden
- ❌ No @Roles() defined → 200 OK (allows all authenticated)

## Token System Details

### AccessToken (JWT)

- **Expiration**: 15 minutes
- **Use**: API requests via `Authorization: Bearer {token}` header
- **Payload**:
  ```json
  {
    "userId": 1,
    "userName": "john_doe",
    "role": "user",
    "type": "access",
    "iat": 1234567890,
    "exp": 1234569690
  }
  ```

### RefreshToken (JWT + Database)

- **Expiration**: 7 days
- **Use**: Get new access token via `/auth/refresh` endpoint
- **Storage**: Hashed in `refresh_tokens` table for revocation tracking
- **Payload**:
  ```json
  {
    "userId": 1,
    "userName": "john_doe",
    "role": "user",
    "type": "refresh",
    "iat": 1234567890,
    "exp": 1234913290
  }
  ```

## Security Features

### 1. Token Rotation

```typescript
// Old refresh token invalidated
storedToken.isRevoked = true;
await this.refreshTokenRepository.save(storedToken);

// New token pair generated
const newTokenPair = await this.generateTokenPair(user);
```

### 2. Password Security

- Passwords hashed with bcrypt (10 rounds)
- Passwords never returned in responses
- Password comparison uses timing-safe bcrypt

### 3. Token Validation

- Access tokens rejected if type is 'refresh'
- Refresh tokens verified against database hash
- Expired tokens automatically rejected

### 4. Role-Based Access

- Roles checked against `@Roles()` decorator
- Insufficient permissions → 403 Forbidden
- Detailed error messages in logs

## Database Entities

### RefreshToken Entity

```sql
CREATE TABLE refresh_tokens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  token_hash VARCHAR(500) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX IDX_refresh_tokens_user_id (user_id),
  INDEX IDX_refresh_tokens_expires_at (expires_at)
);
```

### Refresh Token Properties

- `id`: Primary key
- `userId`: Foreign key to User
- `tokenHash`: Hashed refresh token (bcrypt)
- `expiresAt`: Expiration timestamp
- `isRevoked`: Soft revocation flag
- `createdAt`: Creation timestamp
- `deletedAt`: Soft delete timestamp

## Configuration (.env)

```env
# JWT Configuration (required)
JWT_SECRET=your_super_secret_key_change_this_in_production
JWT_EXPIRATION=24h  # Legacy, actual values are hardcoded

# Access Token: 15 minutes
# Refresh Token: 7 days
```

**Important**: Change `JWT_SECRET` in production! Use a strong, randomly generated key:

```bash
# Generate secure secret
openssl rand -base64 32
```

## Error Handling

All auth errors throw custom exceptions with appropriate HTTP status codes:

| Exception                      | Status | Message                        |
| ------------------------------ | ------ | ------------------------------ |
| `InvalidCredentialsException`  | 401    | Invalid username or password   |
| `UserAlreadyExistsException`   | 400    | User already exists            |
| `UserNotActiveException`       | 403    | User account is inactive       |
| `InvalidTokenException`        | 401    | Invalid or expired token       |
| `RefreshTokenRevokedException` | 401    | Refresh token has been revoked |
| `RefreshTokenExpiredException` | 401    | Refresh token has expired      |

## Usage Examples

### Frontend Implementation (TypeScript)

```typescript
// 1. Login and get tokens
const loginResponse = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userName: 'john',
    password: 'SecurePass123',
  }),
});

const data = await loginResponse.json();
const { token } = data;
localStorage.setItem('accessToken', token.accessToken);
localStorage.setItem('refreshToken', token.refreshToken);

// 2. Use access token for API calls
const response = await fetch('/api/exams', {
  headers: {
    Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
  },
});

// 3. When access token expires, refresh it
if (response.status === 401) {
  const refreshResponse = await fetch('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refreshToken: localStorage.getItem('refreshToken'),
    }),
  });

  const newData = await refreshResponse.json();
  localStorage.setItem('accessToken', newData.accessToken);
  localStorage.setItem('refreshToken', newData.refreshToken);

  // Retry original request with new token
  const retryResponse = await fetch('/api/exams', {
    headers: {
      Authorization: `Bearer ${newData.accessToken}`,
    },
  });
}

// 4. Logout
await fetch('/auth/logout', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
  },
});

localStorage.removeItem('accessToken');
localStorage.removeItem('refreshToken');
```

## Best Practices

1. **Always use HTTPS in production** - Tokens must be transmitted securely
2. **Rotate JWT_SECRET periodically** - Reduces risk of key compromise
3. **Implement token refresh mechanism** - Keep access tokens short-lived
4. **Log authentication events** - Monitor suspicious activities
5. **Use RolesGuard for sensitive operations** - Implement least privilege principle
6. **Store refresh tokens securely** - Use httpOnly cookies (not localStorage)
7. **Implement rate limiting** - Prevent brute force attacks on login
8. **Use strong passwords** - Enforce minimum length and complexity

## Troubleshooting

### "Invalid username or password"

- Verify username and password are correct
- Check user status is 'active'
- Check user exists in database

### "Invalid or expired token"

- Token has expired → Use refresh token
- Token format is invalid → Check `Authorization` header format
- Wrong token type → Ensure using accessToken, not refreshToken

### "Refresh token has been revoked"

- User has logged out
- Token was used for refresh (auto-revoked)
- Login again to get new token pair

### "Insufficient permissions"

- User role doesn't match required role
- Check `@Roles()` decorator on the route
- Contact admin to change user role if needed

### "User not found"

- User was deleted from database
- Login again to create new session

## Migration & Deployment

### First Time Setup

```bash
# 1. Install dependencies
yarn install

# 2. Run migrations
yarn migration:run

# 3. Start server
yarn dev
```

### After Auth Module Update

```bash
# 1. Generate migration (automatic)
yarn typeorm migration:generate src/database/migrations/{name}

# 2. Review and run migration
yarn migration:run

# 3. Restart server
yarn dev
```

## Monitoring & Logs

The auth module logs:

- User registration: `New user registered: {userName}`
- User login: `User logged in: {userName}`
- Token refresh: `Token refreshed for user: {userName}`
- Logout: `User logged out: {userId}`
- Access denied: `Access denied for user {userId} with role {role}`
- Failed authentication: `Authentication failed: {reason}`

Example log output:

```
[Nest] 12345 - 04/24/2026, 2:30:45 PM LOG [AuthService] New user registered: john_doe
[Nest] 12345 - 04/24/2026, 2:31:10 PM LOG [AuthService] User logged in: john_doe
[Nest] 12345 - 04/24/2026, 2:35:45 PM LOG [AuthService] Token refreshed for user: john_doe
[Nest] 12345 - 04/24/2026, 2:36:20 PM WARN [RolesGuard] Access denied for user 1 with role user
```
