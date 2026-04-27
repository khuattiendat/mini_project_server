import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuestionManyExam1777100000001 implements MigrationInterface {
  name = 'QuestionManyExam1777100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX `UQ_questions_exam_id` ON `questions`');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE UNIQUE INDEX `UQ_questions_exam_id` ON `questions` (`exam_id`)',
    );
  }
}
