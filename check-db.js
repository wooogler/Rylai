const Database = require('better-sqlite3');
const db = new Database('./data/rylai.db');

console.log('=== Users ===');
const users = db.prepare('SELECT id, username, user_type FROM users').all();
console.log(users);

console.log('\n=== Scenarios ===');
const scenarios = db.prepare('SELECT id, user_id, slug, name FROM scenarios').all();
console.log(scenarios);

db.close();
