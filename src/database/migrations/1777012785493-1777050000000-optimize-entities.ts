import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizeEntities1777012785493 implements MigrationInterface {
  name = 'OptimizeEntities1777012785493';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`user_logs\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`user_id\` int NOT NULL, \`action\` varchar(255) NOT NULL, \`object_type\` varchar(255) NULL, \`ref_id\` int NULL, \`metadata\` json NULL, INDEX \`IDX_user_logs_object_type_ref_id\` (\`object_type\`, \`ref_id\`), INDEX \`IDX_user_logs_action\` (\`action\`), INDEX \`IDX_user_logs_user_id\` (\`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`user_answers\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`attempt_id\` int NOT NULL, \`question_id\` int NOT NULL, \`selected_choice_id\` int NOT NULL, \`is_correct\` tinyint NULL, INDEX \`IDX_user_answers_is_correct\` (\`is_correct\`), INDEX \`IDX_user_answers_selected_choice_id\` (\`selected_choice_id\`), INDEX \`IDX_user_answers_question_id\` (\`question_id\`), INDEX \`IDX_user_answers_attempt_id\` (\`attempt_id\`), UNIQUE INDEX \`UQ_user_answers_attempt_question\` (\`attempt_id\`, \`question_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`choices\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`question_id\` int NOT NULL, \`content\` text NOT NULL, \`is_correct\` tinyint NOT NULL, INDEX \`IDX_choices_question_id\` (\`question_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`questions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`exam_id\` int NOT NULL, \`content\` text NOT NULL, \`order_index\` int NOT NULL, INDEX \`IDX_questions_exam_id\` (\`exam_id\`), UNIQUE INDEX \`UQ_questions_exam_order\` (\`exam_id\`, \`order_index\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`exams\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`title\` varchar(255) NOT NULL, \`description\` text NULL, \`duration\` int NOT NULL, \`start_date\` timestamp NOT NULL, INDEX \`IDX_exams_start_date\` (\`start_date\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`exam_attempts\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`user_id\` int NOT NULL, \`exam_id\` int NOT NULL, \`attempt_no\` int NOT NULL, \`status\` enum ('initialized', 'active', 'violated', 'submitted', 'terminated') NOT NULL DEFAULT 'initialized', \`device_id\` varchar(255) NULL, \`started_at\` timestamp NULL, \`submitted_at\` timestamp NULL, \`ended_at\` timestamp NULL, INDEX \`IDX_exam_attempts_ended_at\` (\`ended_at\`), INDEX \`IDX_exam_attempts_submitted_at\` (\`submitted_at\`), INDEX \`IDX_exam_attempts_started_at\` (\`started_at\`), INDEX \`IDX_exam_attempts_status\` (\`status\`), INDEX \`IDX_exam_attempts_exam_id\` (\`exam_id\`), INDEX \`IDX_exam_attempts_user_id\` (\`user_id\`), UNIQUE INDEX \`UQ_exam_attempts_user_exam_attempt_no\` (\`user_id\`, \`exam_id\`, \`attempt_no\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`violations\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`attempt_id\` int NOT NULL, \`type\` varchar(255) NOT NULL, \`metadata\` json NULL, INDEX \`IDX_violations_type\` (\`type\`), INDEX \`IDX_violations_attempt_id\` (\`attempt_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_users_user_name\` ON \`users\` (\`user_name\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_users_device_id\` ON \`users\` (\`device_id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_users_status\` ON \`users\` (\`status\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_users_role\` ON \`users\` (\`role\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_logs\` ADD CONSTRAINT \`FK_6bea02878a5067f778dc5a62cb9\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_answers\` ADD CONSTRAINT \`FK_60b3d170e680c0bb8af432cdc7d\` FOREIGN KEY (\`attempt_id\`) REFERENCES \`exam_attempts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_answers\` ADD CONSTRAINT \`FK_adae59e684b873b084be36c5a7a\` FOREIGN KEY (\`question_id\`) REFERENCES \`questions\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_answers\` ADD CONSTRAINT \`FK_7ede5d5a1b018908ca1f174d8a4\` FOREIGN KEY (\`selected_choice_id\`) REFERENCES \`choices\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`choices\` ADD CONSTRAINT \`FK_dfae910f5d297b8f56206f08bd9\` FOREIGN KEY (\`question_id\`) REFERENCES \`questions\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`questions\` ADD CONSTRAINT \`FK_f912d2c24bc84f66e0a40b1c169\` FOREIGN KEY (\`exam_id\`) REFERENCES \`exams\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`exam_attempts\` ADD CONSTRAINT \`FK_b916abc8486fe8533288d72e7bc\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`exam_attempts\` ADD CONSTRAINT \`FK_cccf5df8532bd51cf017f4a30a6\` FOREIGN KEY (\`exam_id\`) REFERENCES \`exams\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`violations\` ADD CONSTRAINT \`FK_5ae4ca316f7148ec13188a34b30\` FOREIGN KEY (\`attempt_id\`) REFERENCES \`exam_attempts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`violations\` DROP FOREIGN KEY \`FK_5ae4ca316f7148ec13188a34b30\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`exam_attempts\` DROP FOREIGN KEY \`FK_cccf5df8532bd51cf017f4a30a6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`exam_attempts\` DROP FOREIGN KEY \`FK_b916abc8486fe8533288d72e7bc\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`questions\` DROP FOREIGN KEY \`FK_f912d2c24bc84f66e0a40b1c169\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`choices\` DROP FOREIGN KEY \`FK_dfae910f5d297b8f56206f08bd9\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_answers\` DROP FOREIGN KEY \`FK_7ede5d5a1b018908ca1f174d8a4\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_answers\` DROP FOREIGN KEY \`FK_adae59e684b873b084be36c5a7a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_answers\` DROP FOREIGN KEY \`FK_60b3d170e680c0bb8af432cdc7d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_logs\` DROP FOREIGN KEY \`FK_6bea02878a5067f778dc5a62cb9\``,
    );
    await queryRunner.query(`DROP INDEX \`IDX_users_role\` ON \`users\``);
    await queryRunner.query(`DROP INDEX \`IDX_users_status\` ON \`users\``);
    await queryRunner.query(`DROP INDEX \`IDX_users_device_id\` ON \`users\``);
    await queryRunner.query(`DROP INDEX \`UQ_users_user_name\` ON \`users\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_violations_attempt_id\` ON \`violations\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_violations_type\` ON \`violations\``,
    );
    await queryRunner.query(`DROP TABLE \`violations\``);
    await queryRunner.query(
      `DROP INDEX \`UQ_exam_attempts_user_exam_attempt_no\` ON \`exam_attempts\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_exam_attempts_user_id\` ON \`exam_attempts\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_exam_attempts_exam_id\` ON \`exam_attempts\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_exam_attempts_status\` ON \`exam_attempts\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_exam_attempts_started_at\` ON \`exam_attempts\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_exam_attempts_submitted_at\` ON \`exam_attempts\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_exam_attempts_ended_at\` ON \`exam_attempts\``,
    );
    await queryRunner.query(`DROP TABLE \`exam_attempts\``);
    await queryRunner.query(`DROP INDEX \`IDX_exams_start_date\` ON \`exams\``);
    await queryRunner.query(`DROP TABLE \`exams\``);
    await queryRunner.query(
      `DROP INDEX \`UQ_questions_exam_order\` ON \`questions\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_questions_exam_id\` ON \`questions\``,
    );
    await queryRunner.query(`DROP TABLE \`questions\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_choices_question_id\` ON \`choices\``,
    );
    await queryRunner.query(`DROP TABLE \`choices\``);
    await queryRunner.query(
      `DROP INDEX \`UQ_user_answers_attempt_question\` ON \`user_answers\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_user_answers_attempt_id\` ON \`user_answers\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_user_answers_question_id\` ON \`user_answers\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_user_answers_selected_choice_id\` ON \`user_answers\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_user_answers_is_correct\` ON \`user_answers\``,
    );
    await queryRunner.query(`DROP TABLE \`user_answers\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_user_logs_user_id\` ON \`user_logs\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_user_logs_action\` ON \`user_logs\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_user_logs_object_type_ref_id\` ON \`user_logs\``,
    );
    await queryRunner.query(`DROP TABLE \`user_logs\``);
  }
}
