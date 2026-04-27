import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuestionOneToOneExam1777100000000 implements MigrationInterface {
  name = 'QuestionOneToOneExam1777100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX `UQ_questions_exam_order` ON `questions`',
    );

    await queryRunner.query(
      'CREATE UNIQUE INDEX `UQ_questions_exam_id` ON `questions` (`exam_id`)',
    );

    await queryRunner.query(
      'ALTER TABLE `questions` MODIFY `order_index` int NOT NULL DEFAULT 1',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `questions` MODIFY `order_index` int NOT NULL',
    );

    await queryRunner.query('DROP INDEX `UQ_questions_exam_id` ON `questions`');

    await queryRunner.query(
      'CREATE UNIQUE INDEX `UQ_questions_exam_order` ON `questions` (`exam_id`, `order_index`)',
    );
  }
}
