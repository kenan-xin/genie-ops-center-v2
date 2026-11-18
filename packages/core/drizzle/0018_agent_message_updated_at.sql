-- When a save by an assistant message's id last replaced its parts (C15-1): a run saves its answer at each
-- checkpoint, so its first save is not when it ended. Nullable, so no row is rewritten.
ALTER TABLE "agent_message" ADD COLUMN "updated_at" timestamp with time zone;
