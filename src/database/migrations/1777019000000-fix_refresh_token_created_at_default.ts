import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixRefreshTokenCreatedAtDefault1777019000000 implements MigrationInterface {
  name = 'FixRefreshTokenCreatedAtDefault1777019000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\` MODIFY \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\` MODIFY \`created_at\` timestamp NOT NULL`,
    );
  }
}
