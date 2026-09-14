// `server-only` throws when imported outside a React Server Component. Vitest runs
// plain Node, so it is aliased to this no-op. The guard still applies in the app.
export {};
