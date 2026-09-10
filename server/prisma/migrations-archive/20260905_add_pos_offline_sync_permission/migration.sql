-- Phase 16: Add pos.offline.sync permission for offline data synchronization
-- This permission allows POS clients to fetch data for local caching

INSERT INTO "permissions" (id, name, module, action, description)
VALUES (
  gen_random_uuid()::text,
  'pos.offline.sync',
  'pos',
  'sync',
  'Synchronize POS data for offline cache'
)
ON CONFLICT (name) DO NOTHING;
