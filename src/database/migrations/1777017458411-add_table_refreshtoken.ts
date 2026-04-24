import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTableRefreshtoken1777017458411 implements MigrationInterface {
  name = 'AddTableRefreshtoken1777017458411';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`refresh_tokens\` (\`id\` int NOT NULL AUTO_INCREMENT, \`user_id\` int NOT NULL, \`token_hash\` varchar(500) NOT NULL, \`expires_at\` timestamp NOT NULL, \`is_revoked\` tinyint NOT NULL DEFAULT 0, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`deleted_at\` timestamp NULL, INDEX \`IDX_refresh_tokens_expires_at\` (\`expires_at\`), INDEX \`IDX_refresh_tokens_token_hash\` (\`token_hash\`), INDEX \`IDX_refresh_tokens_user_id\` (\`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\` ADD CONSTRAINT \`FK_3ddc983c5f7bcf132fd8732c3f4\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\` DROP FOREIGN KEY \`FK_3ddc983c5f7bcf132fd8732c3f4\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_refresh_tokens_user_id\` ON \`refresh_tokens\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_refresh_tokens_token_hash\` ON \`refresh_tokens\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_refresh_tokens_expires_at\` ON \`refresh_tokens\``,
    );
    await queryRunner.query(`DROP TABLE \`refresh_tokens\``);
  }
}
