CREATE TABLE IF NOT EXISTS worldmap_daily (day TEXT PRIMARY KEY, visitors INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS worldmap_areas (
  area_key TEXT PRIMARY KEY, lat REAL NOT NULL, lng REAL NOT NULL,
  country TEXT NOT NULL, region TEXT NOT NULL DEFAULT '', visitors INTEGER NOT NULL DEFAULT 0 CHECK(visitors >= 0)
);
CREATE TABLE IF NOT EXISTS worldmap_visitors (
  visitor_hash TEXT PRIMARY KEY, area_key TEXT NOT NULL REFERENCES worldmap_areas(area_key),
  first_day TEXT NOT NULL, excluded INTEGER NOT NULL DEFAULT 0 CHECK(excluded IN (0,1))
);
CREATE INDEX IF NOT EXISTS worldmap_visible_areas ON worldmap_areas(visitors DESC);
CREATE TRIGGER IF NOT EXISTS worldmap_new_visitor AFTER INSERT ON worldmap_visitors
BEGIN
  UPDATE worldmap_areas SET visitors=visitors+1 WHERE area_key=NEW.area_key AND NEW.excluded=0;
  UPDATE worldmap_daily SET visitors=visitors+1 WHERE day=NEW.first_day;
END;
CREATE TRIGGER IF NOT EXISTS worldmap_exclusion AFTER UPDATE OF excluded ON worldmap_visitors
WHEN OLD.excluded != NEW.excluded
BEGIN
  UPDATE worldmap_areas SET visitors=visitors+CASE WHEN NEW.excluded=1 THEN -1 ELSE 1 END WHERE area_key=NEW.area_key;
END;
