import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });
const r = await sql`select version() as v, current_database() as db`;
console.log(r[0].v.slice(0, 60), '|', r[0].db);
await sql.end();
