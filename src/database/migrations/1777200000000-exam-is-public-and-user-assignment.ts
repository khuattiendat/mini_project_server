import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExamIsPublicAndUserAssignment1777200000000
  implements MigrationInterface
{
  name = 'ExamIsPublicAndUserAssignment1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add is_public column to exams
    await queryRunner.query(`
      ALTER TABLE \`exams\`
      ADD COLUMN \`is_public\` tinyint(1) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_exams_is_public\` ON \`exams\` (\`is_public\`)
    `);

    // Create junction table exam_user_assignments
    await queryRunner.query(`
      CREATE TABLE \`exam_user_assignments\` (
        \`exam_id\` int NOT NULL,
        \`user_id\` int NOT NULL,
        PRIMARY KEY (\`exam_id\`, \`user_id\`),
        INDEX \`IDX_exam_user_assignments_exam_id\` (\`exam_id\`),
        INDEX \`IDX_exam_user_assignments_user_id\` (\`user_id\`),
        CONSTRAINT \`FK_exam_user_assignments_exam\`
          FOREIGN KEY (\`exam_id\`) REFERENCES \`exams\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_exam_user_assignments_user\`
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`exam_user_assignments\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_exams_is_public\` ON \`exams\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`exams\` DROP COLUMN \`is_public\``,
    );
  }
}
