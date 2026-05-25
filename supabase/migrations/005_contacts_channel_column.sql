-- Asegura que la columna acquisition_channel existe en contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS acquisition_channel TEXT DEFAULT '';

-- Índice para filtrar por canal
CREATE INDEX IF NOT EXISTS contacts_acquisition_channel_idx ON contacts(acquisition_channel);
