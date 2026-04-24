import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { User, UserRole } from 'src/database/entities/user.entity';
import { CurrentUser } from './common/decorators/current-user.decorator';
import { Roles } from './common/decorators/roles.decorator';

/**
 * Example Exam Controller demonstrating Auth usage
 *
 * Guard Chaining:
 * - JwtGuard: Validates JWT token (authentication)
 * - RolesGuard: Validates user role (authorization)
 *
 * Usage:
 * @UseGuards(JwtGuard) - Requires valid JWT token
 * @UseGuards(JwtGuard, RolesGuard) - Requires JWT + role validation
 * @Roles(...) - Specify allowed roles (only works with RolesGuard)
 */

@Controller('exams')
@UseGuards(JwtGuard) // All endpoints require JWT
export class ExamController {
  private readonly logger = new Logger(ExamController.name);

  /**
   * Get all exams - Any authenticated user
   * GET /api/exams
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllExams(@CurrentUser() user: User) {
    this.logger.log(`User ${user.id} fetching all exams`);
    return {
      message: `Hello ${user.userName}, here are all exams`,
      userId: user.id,
      role: user.role,
    };
  }

  /**
   * Create exam - Only ADMIN
   * POST /api/exams
   */
  @Post()
  @UseGuards(RolesGuard) // Add role guard for this endpoint
  @Roles(UserRole.ADMIN) // Only ADMIN can create
  @HttpCode(HttpStatus.CREATED)
  async createExam(@Body() body: any, @CurrentUser() user: User) {
    this.logger.log(`Admin ${user.id} creating new exam`);
    return {
      message: `Exam created by admin ${user.userName}`,
      data: body,
      createdBy: user.id,
    };
  }

  /**
   * Get exam by ID - Any authenticated user
   * GET /api/exams/:id
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getExam(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.log(`User ${user.id} fetching exam ${id}`);
    return {
      message: `Exam ${id} retrieved by user ${user.userName}`,
      examId: id,
      userId: user.id,
      role: user.role,
    };
  }

  /**
   * Update exam - Only ADMIN
   * PUT /api/exams/:id
   */
  @Post(':id/update')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateExam(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: User,
  ) {
    this.logger.log(`Admin ${user.id} updating exam ${id}`);
    return {
      message: `Exam ${id} updated by admin ${user.userName}`,
      examId: id,
      updates: body,
    };
  }

  /**
   * Delete exam - Only ADMIN
   * DELETE /api/exams/:id
   */
  @Post(':id/delete')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteExam(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.log(`Admin ${user.id} deleting exam ${id}`);
    return {
      message: `Exam ${id} deleted by admin ${user.userName}`,
      deletedBy: user.id,
    };
  }

  /**
   * Start exam attempt - Any authenticated user
   * POST /api/exams/:id/start
   */
  @Post(':id/start')
  @HttpCode(HttpStatus.CREATED)
  async startExam(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.log(`User ${user.id} starting exam ${id}`);
    return {
      message: `Exam ${id} started by ${user.userName}`,
      attemptId: 123,
      userId: user.id,
    };
  }

  /**
   * Get exam statistics - Only ADMIN
   * GET /api/exams/:id/stats
   */
  @Get(':id/stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getExamStats(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.log(`Admin ${user.id} viewing stats for exam ${id}`);
    return {
      examId: id,
      totalAttempts: 42,
      averageScore: 75.5,
      viewedBy: user.id,
    };
  }

  /**
   * Multiple allowed roles example
   * POST /api/exams/:id/archive
   * Accessible to: ADMIN or USER with special permission
   */
  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN) // Only ADMIN for now, can add more roles later
  @HttpCode(HttpStatus.OK)
  async archiveExam(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.log(`User ${user.id} archiving exam ${id}`);
    return {
      message: `Exam ${id} archived`,
      archivedBy: user.id,
    };
  }
}
