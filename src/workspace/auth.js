const bcrypt = require("bcryptjs");

async function verifyCredentials(username, password) {
  const expectedUser = process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedUser || !expectedPassword || !expectedPassword.startsWith("$2")) return false;
  if (username !== expectedUser) return false;
  return bcrypt.compare(password, expectedPassword);
}

module.exports = { verifyCredentials };
