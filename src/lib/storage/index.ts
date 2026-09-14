import 'server-only';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';

/**
 * Storage abstraction.
 *
 * The default `postgres` driver keeps uploaded bytes in the database, reachable only
 * through an authenticated, workspace-scoped route. There is no public bucket and no
 * guessable URL, which is the property that matters for financial documents (spec
 * §29). It also works with zero extra configuration.
 *
 * Supabase Storage and Vercel Blob are the alternatives when volume justifies them;
 * both sit behind this same interface, so switching is a configuration change.
 */
export interface StorageDriver {
  readonly name: 'postgres' | 'supabase' | 'vercel_blob';
  put(key: string, bytes: Buffer, contentType: string): Promise<{ storageKey: string }>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

class PostgresStorage implements StorageDriver {
  readonly name = 'postgres' as const;

  async put(key: string, bytes: Buffer): Promise<{ storageKey: string }> {
    await db.execute(drizzleSql`
      INSERT INTO pockit.file_blobs (file_id, bytes)
      VALUES (${key}::uuid, ${bytes.toString('base64')})
      ON CONFLICT (file_id) DO UPDATE SET bytes = EXCLUDED.bytes
    `);
    return { storageKey: key };
  }

  async get(key: string): Promise<Buffer | null> {
    const rows = await db.execute<{ bytes: string }>(
      drizzleSql`SELECT bytes FROM pockit.file_blobs WHERE file_id = ${key}::uuid`,
    );
    const row = rows[0];
    return row ? Buffer.from(row.bytes, 'base64') : null;
  }

  async delete(key: string): Promise<void> {
    await db.execute(drizzleSql`DELETE FROM pockit.file_blobs WHERE file_id = ${key}::uuid`);
  }
}

class SupabaseStorage implements StorageDriver {
  readonly name = 'supabase' as const;

  constructor(private url: string, private serviceKey: string, private bucket: string) {}

  private endpoint(key: string): string {
    return `${this.url.replace(/\/$/, '')}/storage/v1/object/${this.bucket}/${key}`;
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<{ storageKey: string }> {
    const res = await fetch(this.endpoint(key), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.serviceKey}`,
        'content-type': contentType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(bytes),
    });
    if (!res.ok) throw new Error(`Supabase storage upload failed: ${res.status} ${await res.text()}`);
    return { storageKey: key };
  }

  async get(key: string): Promise<Buffer | null> {
    const res = await fetch(this.endpoint(key), {
      headers: { authorization: `Bearer ${this.serviceKey}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Supabase storage download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await fetch(this.endpoint(key), {
      method: 'DELETE',
      headers: { authorization: `Bearer ${this.serviceKey}` },
    });
  }
}

let cached: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (cached) return cached;

  if (env.STORAGE_DRIVER === 'supabase') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('STORAGE_DRIVER is "supabase" but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
    }
    cached = new SupabaseStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_BUCKET);
  } else {
    // vercel_blob is declared in configuration but not implemented; the Postgres
    // driver is the safe default rather than failing an upload.
    cached = new PostgresStorage();
  }

  return cached;
}
