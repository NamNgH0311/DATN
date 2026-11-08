const AppError = require("./AppError");

function assertString(value, name, { min = 1, max = 255 } = {}) {
  if (typeof value !== "string") {
    throw new AppError(400, `${name} là bắt buộc`, "VALIDATION_ERROR");
  }

  const result = value.trim();

  if (result.length < min || result.length > max) {
    throw new AppError(
      400,
      `${name} phải từ ${min} đến ${max} ký tự`,
      "VALIDATION_ERROR",
    );
  }

  return result;
}

module.exports = { assertString };
