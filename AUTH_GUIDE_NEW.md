# Auth Module Documentation (Quick Reference)

> **Comprehensive Documentation Available**: See [AUTH_SENIOR_GUIDE.md](AUTH_SENIOR_GUIDE.md) for complete architecture, best practices, and detailed explanations.

## Quick Start

### Installation

Dependencies are already installed:

```bash
@nestjs/jwt ^11.0.2
@nestjs/passport ^11.0.5
passport-jwt ^4.0.1
bcrypt ^6.0.0
```

### Environment Setup

```env
JWT_SECRET=your_super_secret_key_change_this_in_production
```

### Folder Structure

```
src/auth/
├── auth.module.ts
├── auth.service.ts
├── auth.controller.ts
├── decorators/                 # @CurrentUser, @Roles
├── guards/                     # JwtGuard, RolesGuard
├── strategies/                 # JWT Passport strategy
├── dtos/                       # Request/response DTOs with validation
├── interfaces/                 # Type definitions
└── exceptions/                 # Custom auth exceptions
```

## API Endpoints

### 1. Sign Up (Register)

```
POST /api/auth/signup
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
POST /api/auth/login
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
POST /api/auth/refresh
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
- AccessToken expires in 15 minutes
- RefreshToken expires in 7 days
- Old refresh token is automatically revoked
```

### 4. Logout

```
POST /api/auth/logout
Authorization: Bearer {accessToken}

Response (200 OK):
{
  "message": "Logout successful"
}

Notes:
- Revokes all refresh tokens for the user
```

### 5. Get Current User Profile

```
GET /api/auth/me
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

## Token System

| Token        | Expiration | Use Case                                         |
| ------------ | ---------- | ------------------------------------------------ |
| AccessToken  | 15 minutes | API requests with `Authorization: Bearer` header |
| RefreshToken | 7 days     | Get new AccessToken via `/auth/refresh` endpoint |

**Flow:**

1. Login → Get AccessToken + RefreshToken
2. Use AccessToken for API calls (15 min valid)
3. When expired → Use RefreshToken to get new pair
4. Old RefreshToken revoked → Can't reuse
5. Logout → All tokens revoked

## Usage in Controllers

### Protect Route (Authentication)

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guards/jwt.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { User } from 'src/database/entities/user.entity';

@Controller('exams')
@UseGuards(JwtGuard) // Requires valid JWT
export class ExamController {
  @Get()
  getExams(@CurrentUser() user: User) {
    return { message: `Exams for ${user.userName}` };
  }
}
```

### Role-Based Access (Authorization)

```typescript
import { UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guards/jwt.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { User, UserRole } from 'src/database/entities/user.entity';

@UseGuards(JwtGuard, RolesGuard)  // Chain guards
@Roles(UserRole.ADMIN)  // Only admin
@Post()
createExam(@CurrentUser() user: User) {
  return { message: `Created by ${user.userName}` };
}

@Roles(UserRole.ADMIN, UserRole.USER)  // Multiple roles
@Post(':id/attempt')
startExam(@CurrentUser() user: User) {
  return { message: `Exam started by ${user.userName}` };
}
```

## Decorators

### @CurrentUser()

Injects the authenticated user from JWT token:

```typescript
@Get('profile')
getProfile(@CurrentUser() user: User) {
  return user;  // { id, userName, fullName, role, status, ... }
}
```

### @Roles(...roles)

Specify allowed roles (requires RolesGuard):

```typescript
@Roles(UserRole.ADMIN)  // Single role
@Roles(UserRole.ADMIN, UserRole.USER)  // Multiple roles
```

## Guards

### @UseGuards(JwtGuard)

Validates JWT token in `Authorization: Bearer {token}` header.

- ✅ Valid token → Request.user populated
- ❌ Missing/invalid/expired → 401 Unauthorized
- ❌ Refresh token (wrong type) → 401 Unauthorized

### @UseGuards(RolesGuard)

Validates user role against `@Roles()` decorator.

- ✅ Role matches → Allowed
- ❌ Role doesn't match → 403 Forbidden
- ⚠️ No @Roles() defined → Allows all authenticated users

## User Roles

```typescript
enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}
```

## Example Usage

### 1. Sign Up

```bash
curl -X POST http://localhost:1401/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "userName":"john",
    "password":"SecurePass123",
    "fullName":"John Doe"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:1401/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userName":"john","password":"SecurePass123"}'
```

### 3. Use Access Token

```bash
curl http://localhost:1401/api/exams \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 4. Refresh Token (When Expired)

```bash
curl -X POST http://localhost:1401/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'
```

### 5. Logout

```bash
curl -X POST http://localhost:1401/api/auth/logout \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Troubleshooting

| Issue                        | Cause                            | Solution                              |
| ---------------------------- | -------------------------------- | ------------------------------------- |
| 401 Invalid credentials      | Wrong username/password          | Check credentials                     |
| 401 Invalid or expired token | Token expired or invalid         | Use `/auth/refresh` with refreshToken |
| 401 User not found           | User deleted from DB             | Login again                           |
| 403 Insufficient permissions | User role doesn't match          | Contact admin to change role          |
| 401 Invalid token type       | Used refreshToken as accessToken | Use accessToken for API calls         |

## Best Practices

1. **Change JWT_SECRET in production** - Use strong, random key
2. **Use HTTPS only** - Never transmit tokens over HTTP
3. **Keep AccessToken short-lived** - 15 minutes is default
4. **Implement token refresh** - Automatically refresh before expiry
5. **Store tokens securely** - Use httpOnly cookies (not localStorage)
6. **Log authentication events** - Monitor suspicious activities
7. **Rate limit login attempts** - Prevent brute force attacks
8. **Rotate secrets periodically** - Reduce compromise risk

---

**See [AUTH_SENIOR_GUIDE.md](AUTH_SENIOR_GUIDE.md) for:**

- Detailed architecture explanation
- Security patterns and best practices
- Frontend integration examples
- Monitoring and logging strategies
- Production deployment checklist
- Advanced examples and use cases
