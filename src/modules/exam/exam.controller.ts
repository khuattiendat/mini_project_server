import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { User, UserRole } from 'src/database/entities/user.entity';
import { JwtGuard, RolesGuard } from '../auth';
import { CreateExamDto } from './dto/create-exam.dto';
import { ExamQueryDto } from './dto/exam-query.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { AssignUsersDto } from './dto/assign-users.dto';
import { ExamService } from './exam.service';

@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('exams')
export class ExamController {
  constructor(private readonly examService: ExamService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createExamDto: CreateExamDto) {
    return this.examService.create(createExamDto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() query: ExamQueryDto) {
    return this.examService.findAll(query);
  }

  @Get('dashboard/stats')
  @HttpCode(HttpStatus.OK)
  async getDashboardStats() {
    return this.examService.getDashboardStats();
  }

  // Available exams for the current user (public + assigned) — accessible by any authenticated user
  @Get('available')
  @Roles(UserRole.ADMIN, UserRole.USER)
  @HttpCode(HttpStatus.OK)
  async getAvailableExams(@CurrentUser() user: User) {
    return this.examService.getAvailableExams(user.id);
  }

  // My attempts — accessible by any authenticated user
  @Get('my-attempts')
  @Roles(UserRole.ADMIN, UserRole.USER)
  @HttpCode(HttpStatus.OK)
  async getMyAttempts(@CurrentUser() user: User) {
    return this.examService.getUserAttempts(user.id);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.examService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateExamDto: UpdateExamDto,
  ) {
    return this.examService.update(id, updateExamDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.examService.remove(id);
  }

  // ── History endpoint (admin only) ─────────────────────────────────────────

  @Get(':id/history')
  @HttpCode(HttpStatus.OK)
  async getExamHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query('search') search?: string,
  ) {
    return this.examService.getExamHistory(id, search);
  }

  // ── Assignment endpoints (admin only) ──────────────────────────────────────

  @Get(':id/assigned-users')
  @HttpCode(HttpStatus.OK)
  async getAssignedUsers(@Param('id', ParseIntPipe) id: number) {
    return this.examService.getAssignedUsers(id);
  }

  @Post(':id/assign-users')
  @HttpCode(HttpStatus.OK)
  async assignUsers(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignUsersDto,
  ) {
    return this.examService.assignUsers(id, dto.userIds);
  }

  @Delete(':id/assigned-users/:userId')
  @HttpCode(HttpStatus.OK)
  async unassignUser(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.examService.unassignUser(id, userId);
  }
}
