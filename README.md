all

````

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
````

## 🗃️ Database Migrations

This project uses **TypeORM** for seamless database schema management.

### Creating Migrations

**Generate empty migration file:**

**Auto-generate migration from entity changes:**

```bash
yarn typeorm migration:generate src/database/migrations/[name]
```

> This compares your entities with the current database schema and creates the necessary changes.

### Running Migrations

**Execute all pending migrations:**

```bash
yarn migration:run
```

**seed data**

```bashyarn seed
yarn migration:seed
```

> ⚠️ **Warning**: Always backup your database before running migrations in production!
