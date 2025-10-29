-- Add user_type column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(10) DEFAULT 'user';

-- Update existing users to be 'admin' type (assuming current users are admins)
UPDATE users SET user_type = 'admin' WHERE user_type = 'user';

-- Create user_messages table
CREATE TABLE IF NOT EXISTS user_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE,
  message_id VARCHAR(255) NOT NULL,
  text TEXT NOT NULL,
  sender VARCHAR(10) NOT NULL CHECK (sender IN ('user', 'other')),
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_feedbacks table
CREATE TABLE IF NOT EXISTS user_feedbacks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE,
  message_id VARCHAR(255) NOT NULL,
  feedback_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_messages_user_scenario ON user_messages(user_id, scenario_id);
CREATE INDEX IF NOT EXISTS idx_user_messages_created_at ON user_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_user_feedbacks_user_scenario ON user_feedbacks(user_id, scenario_id);
CREATE INDEX IF NOT EXISTS idx_user_feedbacks_message_id ON user_feedbacks(message_id);
