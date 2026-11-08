const REQUIRED_SECRETS = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];

for (const key of REQUIRED_SECRETS) {
  if (!process.env[key] || process.env[key].length < 32) {
    throw new Error(`Thiếu ${key} hoặc secret phải có ít nhất 32 ký tự`);
  }
}

if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
  throw new Error("JWT access và refresh secret phải khác nhau");
}

module.exports = {
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  ACCESS_EXPIRES_IN: "15m",
  REFRESH_EXPIRES_IN_DAYS: 7,
};
