-- Create scenario_progress table to track user visits
CREATE TABLE IF NOT EXISTS scenario_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  scenario_id INTEGER REFERENCES scenarios(id) ON DELETE CASCADE,
  first_visited_at TIMESTAMPTZ DEFAULT NOW(),
  last_visited_at TIMESTAMPTZ DEFAULT NOW(),
  visit_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, scenario_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_scenario_progress_user ON scenario_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_scenario_progress_scenario ON scenario_progress(scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenario_progress_last_visited ON scenario_progress(last_visited_at);
