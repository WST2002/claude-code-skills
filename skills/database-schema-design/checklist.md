# Schema review checklist

## Integrity

- [ ] Every table has a primary key.
- [ ] Every reference column has a foreign key with a deliberate `ON DELETE` (`CASCADE`, `RESTRICT` or `SET NULL`).
- [ ] Natural uniqueness (email, slug, external ID, one-active-per-user) is a `UNIQUE` constraint or partial unique index.
- [ ] Columns that are always present are `NOT NULL`.
- [ ] Closed value sets use enums, lookup tables or `CHECK` constraints.
- [ ] Money uses exact numeric types; quantities and prices have `CHECK (>= 0)` where valid.
- [ ] Timestamps store time zone (or UTC by convention, documented).
- [ ] No polymorphic association without integrity (use separate FKs or a join table per type).

## Normalization

- [ ] No repeated groups (`phone1`, `phone2`, `phone3`) — use a child table.
- [ ] No copied data that can drift (customer name stored on every order) unless it is an intentional snapshot (price at purchase time), and then it is named and documented as such.
- [ ] Comma-separated lists in a column become a join table.

## Performance

- [ ] Every foreign key column used in joins is indexed.
- [ ] Columns in frequent `WHERE`, `ORDER BY` and `JOIN` have indexes; composite index column order matches the query (equality first, then range or sort).
- [ ] No duplicate or unused indexes on write-heavy tables.
- [ ] Large tables have a plan for growth (partitioning, archiving) if queries filter by time.
- [ ] ORM code does not create N+1 queries for the relationships in the schema.

## Lifecycle and operations

- [ ] `created_at` and `updated_at` exist where rows change.
- [ ] Soft-delete columns are excluded by unique indexes (partial unique on `deleted_at IS NULL`).
- [ ] Migrations are reversible or have a documented rollback.
- [ ] Destructive migrations (drop, rename, type change, new `NOT NULL`) follow expand → migrate → contract.
- [ ] Index creation on big tables is online/concurrent.

## Do not report

- `varchar(255)` on its own is not a defect; flag it only when a real limit is wrong.
- Denormalized snapshot columns that are intentional and documented.
- Missing indexes on tiny lookup tables.
