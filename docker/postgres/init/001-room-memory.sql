CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE umlstudio_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD 'umlstudio_local_app';
CREATE TABLE room_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), diagram_id text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('room','user')), user_id text,
  kind text NOT NULL CHECK (kind IN ('summary','decision','proposal','question')),
  topic_key text, title text NOT NULL, content text NOT NULL, author_id text,
  revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (to_tsvector('spanish', title || ' ' || content)) STORED
);
CREATE INDEX room_memory_search_idx ON room_memory USING gin (search);
CREATE UNIQUE INDEX room_memory_topic_idx ON room_memory (diagram_id, scope, COALESCE(user_id, ''), topic_key) WHERE topic_key IS NOT NULL;
ALTER TABLE room_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_memory FORCE ROW LEVEL SECURITY;
CREATE POLICY room_memory_isolation ON room_memory
  USING (diagram_id = current_setting('app.diagram_id', true) AND (scope = 'room' OR user_id = current_setting('app.user_id', true)))
  WITH CHECK (diagram_id = current_setting('app.diagram_id', true) AND (scope = 'room' OR user_id = current_setting('app.user_id', true)));
GRANT SELECT, INSERT, UPDATE, DELETE ON room_memory TO umlstudio_app;
CREATE FUNCTION room_memory_forget_diagram(target_diagram_id text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF target_diagram_id IS DISTINCT FROM current_setting('app.diagram_id', true) THEN
    RAISE EXCEPTION 'room memory deletion target does not match transaction room';
  END IF;
  DELETE FROM room_memory WHERE diagram_id = target_diagram_id;
END;
$$;
CREATE FUNCTION room_memory_purge_expired() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE deleted_count integer; BEGIN DELETE FROM room_memory WHERE updated_at < now() - interval '120 days'; GET DIAGNOSTICS deleted_count = ROW_COUNT; RETURN deleted_count; END; $$;
GRANT EXECUTE ON FUNCTION room_memory_forget_diagram(text), room_memory_purge_expired() TO umlstudio_app;
