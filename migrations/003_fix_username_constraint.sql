-- Drop the existing unique constraint on username
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;

-- Add a new unique constraint on (username, user_type) combination
ALTER TABLE users ADD CONSTRAINT users_username_user_type_key UNIQUE (username, user_type);
