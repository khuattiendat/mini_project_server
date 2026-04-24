import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1777005553799 implements MigrationInterface {
  name = 'Init1777005553799';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`status\` enum ('active', 'inactive') NOT NULL DEFAULT 'active'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`status\``);
  }
}
