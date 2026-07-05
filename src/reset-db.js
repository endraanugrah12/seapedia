const { resetDb, DB_PATH } = require('./db');
resetDb();
console.log(`Database reset at ${DB_PATH}`);
