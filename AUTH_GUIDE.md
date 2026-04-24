# Auth Module Documentation

> **Updated Documentation Available**: See [AUTH_SENIOR_GUIDE.md](AUTH_SENIOR_GUIDE.md) for comprehensive architecture, patterns, and best practices.

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
├── index.ts                    # Public exports
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
POST /auth/signup
Content-Type: application/json

{
  "userName": "john_doe",
  "password": "password123",
  "fullName": "John Doe"
}

Response:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": 1,
  "userName": "john_doe",
  "fullName": "John Doe",
  "role": "user"
}
```

### 2. Login

```
POST /auth/login
Content-Type: application/json

{
  "userName": "john_doe",
  "password": "password123"
}

Response:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": 1,
  "userName": "john_doe",
  "fullName": "John Doe",
  "role": "user"
}
```

### 3. Get Current User Profile

```
GET /auth/me
Authorization: Bearer {accessToken}

Response:
{
  "id": 1,
  "userName": "john_doe",
  "fullName": "John Doe",
  "role": "user",
  "status": "active"
}
```

## Usage in Controllers

### Basic Authentication (Protect Route)

Any route with `@UseGuards(JwtGuard)` requires valid JWT token:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guards/jwt.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { User } from 'src/database/entities/user.entity';

@Controller('exams')
@UseGuards(JwtGuard)
export class ExamController {
  @Get()
  getExams(@CurrentUser() user: User) {
    // User is automatically injected from JWT token
    return { message: `Exams for ${user.userName}` };
  }
}
```

### Role-Based Access Control (Authorization)

Restrict routes to specific roles:

```typescript
import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guards/jwt.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { User, UserRole } from 'src/database/entities/user.entity';

@Controller('exams')
@UseGuards(JwtGuard, RolesGuard)
export class ExamController {
  @Post()
  @Roles(UserRole.ADMIN) // Only admins can create exams
  createExam(@CurrentUser() user: User) {
    return { message: `Exam created by admin ${user.userName}` };
  }

  @Post(':id/delete')
  @Roles(UserRole.ADMIN) // Only admins can delete
  deleteExam(@CurrentUser() user: User) {
    return { message: `Exam deleted by admin ${user.userName}` };
  }
}
```

### Multiple Roles

Allow multiple roles to access a route:

```typescript
@Post(':id/archive')
@Roles(UserRole.ADMIN, UserRole.INSTRUCTOR) // Both admin and instructor
archiveExam(@CurrentUser() user: User) {
  return { message: `Exam archived by ${user.userName}` };
}
```

## Decorators Reference

### @CurrentUser()

Automatically injects the authenticated user from the JWT token:

```typescript
@Get('profile')
getProfile(@CurrentUser() user: User) {
  // user contains: id, userName, password, fullName, role, status, etc.
  return user;
}
```

### @Roles(...roles: UserRole[])

Specify which roles are allowed to access the route:

```typescript
@Post()
@Roles(UserRole.ADMIN)
createExam() {
  // Only accessible to ADMIN role
}

@Post()
@Roles(UserRole.ADMIN, UserRole.INSTRUCTOR)
modifyExam() {
  // Accessible to ADMIN or INSTRUCTOR
}
```

## Guards Reference

### @UseGuards(JwtGuard)

Validates JWT token. Request must include:

```
Authorization: Bearer {accessToken}
```

Throws `UnauthorizedException` if:

- No token provided
- Token is invalid or expired
- User not found in database

### @UseGuards(RolesGuard)

Validates user role against `@Roles()` decorator. Throws `ForbiddenException` if:

- User role not in allowed roles
- No `@Roles()` decorator defined (allows all authenticated users)

## User Roles

Available roles defined in `User` entity:

```typescript
enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}
```

## Security Best Practices

1. **Change JWT_SECRET in Production**

   ```env
   JWT_SECRET=use_a_long_random_string_generated_securely
   ```

2. **Use HTTPS in Production**
   - Tokens should only be transmitted over HTTPS
   - Prevents token interception

3. **Store Token Securely**
   - Frontend: Use httpOnly cookies or secure storage
   - Never store in localStorage if possible

4. **Token Expiration**
   - Tokens expire after 24h by default
   - Implement refresh token logic for long-lived sessions

5. **Password Requirements**
   - Enforce strong passwords
   - Hash all passwords with bcrypt (already implemented)

## Example Usage Flow

1. **User Signs Up**

   ```bash
   curl -X POST http://localhost:3000/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"userName":"john","password":"pass123","fullName":"John Doe"}'
   ```

   Response includes: `accessToken`, `userId`, `role`

2. **User Logs In**

   ```bash
   curl -X POST http://localhost:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{"userName":"john","password":"pass123"}'
   ```

   Response includes: `accessToken`, `userId`, `role`

3. **Access Protected Route**

   ```bash
   curl http://localhost:3000/exams \
     -H "Authorization: Bearer {accessToken}"
   ```

   Returns user's exams

4. **Admin-Only Route**
   ```bash
   curl -X POST http://localhost:3000/exams \
     -H "Authorization: Bearer {adminAccessToken}" \
     -H "Content-Type: application/json" \
     -d '{"title":"Math Exam",...}'
   ```
   Only works with ADMIN role

## Troubleshooting

### Invalid Token Error

- Check token is included in `Authorization: Bearer {token}` header
- Verify token hasn't expired
- Ensure JWT_SECRET matches in .env

### Forbidden Error

- User role doesn't match required roles
- Check `@Roles()` decorator allows the user's role

### User Not Found

- Token is valid but user was deleted from database
- Login again to get new token

## Next Steps

See `exam.controller.example.ts` for a complete working example of how to use the auth module in a controller.
