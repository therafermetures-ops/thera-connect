-- 1. Table des Portails (Marques, IPs, Coordonnées GPS)
CREATE TABLE portals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  brand TEXT NOT NULL, -- Shelly, Kincony, Norvi, etc.
  ip TEXT NOT NULL,
  relay_index INTEGER DEFAULT 0,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  is_lapi BOOLEAN DEFAULT false,
  options JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Table des Utilisateurs (Profils, Plannings, Codes)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firstname TEXT NOT NULL,
  lastname TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  pincode TEXT, -- Pour clavier RS485
  expiry TIMESTAMPTZ,
  schedule JSONB DEFAULT '{
    "days": {"mon":true, "tue":true, "wed":true, "thu":true, "fri":true, "sat":false, "sun":false},
    "slots": [{"start": "08:00", "end": "18:00"}]
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Table des Règles de Sécurité (Alertes)
CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL, -- 'horaire' ou 'stay_open'
  portals TEXT[], -- Array d'IDs de portails
  days INTEGER[], -- [1,2,3,4,5]
  start_time TIME,
  end_time TIME,
  duration INTEGER, -- en minutes pour stay_open
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Table des Logs (Historique & Sécurité)
CREATE TABLE logs (
  id BIGSERIAL PRIMARY KEY,
  portal_id UUID REFERENCES portals(id),
  action TEXT NOT NULL, -- OPEN, ALERT, REBOOT
  details TEXT,
  operator TEXT,
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- 5. Table des Paramètres (Branding & Wallpaper)
CREATE TABLE settings (
  id TEXT PRIMARY KEY DEFAULT 'current_config',
  app_name TEXT DEFAULT 'Thera Connect',
  primary_color TEXT DEFAULT '#007bff',
  logo_url TEXT,
  wallpaper_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
