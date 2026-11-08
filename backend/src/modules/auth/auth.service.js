const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const prisma = require("../../lib/prisma");
const env = require("../../config/auth.config");
const AppError = require("../../utils/AppError");
const { assertString } = require("../../utils/validators");

const {
  recordFailure,
  clearFailures,
} = require("../../middlewares/accountLoginLimit.middleware");

const SAFE_USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  defaultAddress: true,
  role: true,
  isActive: true,
  createdAt: true,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{8,20}$/;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createTokenPair(userId, sessionId, role) {
  const accessToken = jwt.sign(
    {
      sub: userId,
      sid: sessionId,
      role,
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.ACCESS_EXPIRES_IN,
    },
  );

  const refreshToken = jwt.sign(
    {
      sub: userId,
      sid: sessionId,
      jti: crypto.randomUUID(),
    },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: `${env.REFRESH_EXPIRES_IN_DAYS}d`,
    },
  );

  const refreshPayload = jwt.decode(refreshToken);

  return {
    accessToken,
    refreshToken,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: new Date(refreshPayload.exp * 1000),
  };
}

function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET);
  } catch (error) {
    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError" ||
      error.name === "NotBeforeError"
    ) {
      throw new AppError(
        401,
        "Refresh token không hợp lệ hoặc đã hết hạn",
        "INVALID_REFRESH_TOKEN",
      );
    }

    throw error;
  }
}

function validateRefreshPayload(payload) {
  if (
    typeof payload !== "object" ||
    typeof payload.sub !== "string" ||
    typeof payload.sid !== "string" ||
    typeof payload.jti !== "string"
  ) {
    throw new AppError(
      401,
      "Refresh token không hợp lệ",
      "INVALID_REFRESH_TOKEN",
    );
  }
}

async function register(body = {}) {
  const fullName = assertString(body.fullName, "Họ tên", {
    min: 2,
    max: 120,
  });

  const email = assertString(body.email, "Email", {
    min: 5,
    max: 255,
  }).toLowerCase();

  if (!EMAIL_RE.test(email)) {
    throw new AppError(400, "Email không hợp lệ", "VALIDATION_ERROR");
  }

  if (
    typeof body.password !== "string" ||
    body.password.length < 8 ||
    body.password.length > 72
  ) {
    throw new AppError(
      400,
      "Mật khẩu phải từ 8 đến 72 ký tự",
      "VALIDATION_ERROR",
    );
  }

  let phone = null;

  if (body.phone !== undefined && body.phone !== null && body.phone !== "") {
    phone = assertString(body.phone, "Số điện thoại", {
      min: 8,
      max: 20,
    });

    if (!PHONE_RE.test(phone)) {
      throw new AppError(400, "Số điện thoại không hợp lệ", "VALIDATION_ERROR");
    }
  }

  const passwordHash = await bcrypt.hash(body.password, 10);

  const userId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();

  const tokens = createTokenPair(userId, sessionId, "CUSTOMER");

  try {
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          id: userId,
          fullName,
          email,
          phone,
          passwordHash,
          role: "CUSTOMER",
        },
        select: SAFE_USER_SELECT,
      });

      await tx.userSession.create({
        data: {
          id: sessionId,
          userId,
          refreshTokenHash: tokens.refreshTokenHash,
          expiresAt: tokens.expiresAt,
        },
      });

      return createdUser;
    });

    return {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  } catch (error) {
    if (error.code === "P2002") {
      throw new AppError(409, "Email này đã được sử dụng", "EMAIL_EXISTS");
    }

    throw error;
  }
}

async function login(body = {}) {
  const email = assertString(body.email, "Email", {
    min: 5,
    max: 255,
  }).toLowerCase();

  if (!EMAIL_RE.test(email)) {
    throw new AppError(400, "Email không hợp lệ", "VALIDATION_ERROR");
  }

  if (
    typeof body.password !== "string" ||
    body.password.length === 0 ||
    body.password.length > 72
  ) {
    throw new AppError(400, "Mật khẩu không hợp lệ", "VALIDATION_ERROR");
  }

  const found = await prisma.user.findUnique({
    where: { email },
    select: {
      ...SAFE_USER_SELECT,
      passwordHash: true,
    },
  });

  if (!found) {
    // ✅ Ghi nhận thất bại khi không tìm thấy user
    recordFailure(email);
    throw new AppError(
      401,
      "Email hoặc mật khẩu không chính xác",
      "INVALID_CREDENTIALS",
    );
  }

  const isPasswordValid = await bcrypt.compare(
    body.password,
    found.passwordHash,
  );

  if (!isPasswordValid) {
    // ✅ Ghi nhận thất bại khi sai mật khẩu
    recordFailure(email);
    throw new AppError(
      401,
      "Email hoặc mật khẩu không chính xác",
      "INVALID_CREDENTIALS",
    );
  }

  if (!found.isActive) {
    throw new AppError(403, "Tài khoản đã bị khóa", "ACCOUNT_DISABLED");
  }

  const sessionId = crypto.randomUUID();
  const tokens = createTokenPair(found.id, sessionId, found.role);

  await prisma.userSession.create({
    data: {
      id: sessionId,
      userId: found.id,
      refreshTokenHash: tokens.refreshTokenHash,
      expiresAt: tokens.expiresAt,
    },
  });

  // ✅ Xóa bộ đếm thất bại — SAU khi tạo session thành công
  clearFailures(email);

  const { passwordHash: _passwordHash, ...user } = found;

  return {
    user,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

async function refresh(body = {}) {
  const oldRefreshToken = body.refreshToken;

  if (typeof oldRefreshToken !== "string" || oldRefreshToken.length === 0) {
    throw new AppError(
      400,
      "Vui lòng cung cấp refresh token",
      "VALIDATION_ERROR",
    );
  }

  const payload = verifyRefreshToken(oldRefreshToken);

  validateRefreshPayload(payload);

  const oldTokenHash = hashToken(oldRefreshToken);
  const now = new Date();

  const found = await prisma.userSession.findFirst({
    where: {
      id: payload.sid,
      userId: payload.sub,
      refreshTokenHash: oldTokenHash,
      revokedAt: null,
      expiresAt: { gt: now },
      user: {
        isActive: true,
      },
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: SAFE_USER_SELECT,
      },
    },
  });

  if (!found) {
    throw new AppError(
      401,
      "Refresh token không còn hợp lệ",
      "INVALID_REFRESH_TOKEN",
    );
  }

  const tokens = createTokenPair(found.user.id, found.id, found.user.role);

  const result = await prisma.userSession.updateMany({
    where: {
      id: found.id,
      userId: found.user.id,
      refreshTokenHash: oldTokenHash,
      revokedAt: null,
      expiresAt: { gt: now },
      user: {
        isActive: true,
      },
    },
    data: {
      refreshTokenHash: tokens.refreshTokenHash,
      expiresAt: tokens.expiresAt,
      lastUsedAt: now,
    },
  });

  if (result.count !== 1) {
    throw new AppError(
      401,
      "Refresh token đã được sử dụng hoặc không còn hợp lệ",
      "INVALID_REFRESH_TOKEN",
    );
  }

  return {
    user: found.user,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

async function logout(body = {}) {
  const refreshToken = body.refreshToken;

  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    throw new AppError(
      400,
      "Vui lòng cung cấp refresh token",
      "VALIDATION_ERROR",
    );
  }

  const payload = verifyRefreshToken(refreshToken);

  validateRefreshPayload(payload);

  const tokenHash = hashToken(refreshToken);

  const result = await prisma.userSession.updateMany({
    where: {
      id: payload.sid,
      userId: payload.sub,
      refreshTokenHash: tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: {
      revokedAt: new Date(),
    },
  });

  if (result.count !== 1) {
    throw new AppError(
      401,
      "Refresh token không còn hợp lệ",
      "INVALID_REFRESH_TOKEN",
    );
  }

  return {
    message: "Đăng xuất thành công",
  };
}

async function changePassword(userId, body = {}) {
  const allowedFields = ["currentPassword", "newPassword"];
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((field) => !allowedFields.includes(field)) ||
    typeof body.currentPassword !== "string" ||
    !body.currentPassword ||
    typeof body.newPassword !== "string" ||
    body.newPassword.length < 8 ||
    body.newPassword.length > 72
  ) {
    throw new AppError(
      400,
      "Dữ liệu đổi mật khẩu không hợp lệ",
      "VALIDATION_ERROR",
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, isActive: true },
  });

  if (!user || !user.isActive) {
    throw new AppError(401, "Phiên đăng nhập không hợp lệ", "INVALID_SESSION");
  }

  const validCurrent = await bcrypt.compare(
    body.currentPassword,
    user.passwordHash,
  );
  if (!validCurrent) {
    throw new AppError(
      401,
      "Mật khẩu hiện tại không chính xác",
      "INVALID_CREDENTIALS",
    );
  }

  const samePassword = await bcrypt.compare(
    body.newPassword,
    user.passwordHash,
  );
  if (samePassword) {
    throw new AppError(
      400,
      "Mật khẩu mới phải khác mật khẩu hiện tại",
      "VALIDATION_ERROR",
    );
  }

  const passwordHash = await bcrypt.hash(body.newPassword, 10);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, passwordHash: user.passwordHash, isActive: true },
      data: { passwordHash },
    });
    if (updated.count !== 1) {
      throw new AppError(
        409,
        "Mật khẩu đã thay đổi, vui lòng thử lại",
        "PASSWORD_CHANGED",
      );
    }

    await tx.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  });

  return { message: "Đổi mật khẩu thành công. Vui lòng đăng nhập lại." };
}

async function updateProfile(userId, body = {}) {
  const allowedFields = ["fullName", "phone"];

  const bodyFields = Object.keys(body);

  if (bodyFields.length === 0) {
    throw new AppError(
      400,
      "Cần cung cấp ít nhất một trường để cập nhật",
      "VALIDATION_ERROR",
    );
  }

  const invalidFields = bodyFields.filter(
    (field) => !allowedFields.includes(field),
  );

  if (invalidFields.length > 0) {
    throw new AppError(
      400,
      `Không được phép cập nhật các trường: ${invalidFields.join(", ")}`,
      "VALIDATION_ERROR",
    );
  }

  const data = {};

  if (body.fullName !== undefined) {
    data.fullName = assertString(body.fullName, "Họ tên", {
      min: 2,
      max: 120,
    });
  }

  if (body.phone !== undefined) {
    if (body.phone === null || body.phone === "") {
      data.phone = null;
    } else {
      const phone = assertString(body.phone, "Số điện thoại", {
        min: 8,
        max: 20,
      });

      if (!PHONE_RE.test(phone)) {
        throw new AppError(
          400,
          "Số điện thoại không hợp lệ",
          "VALIDATION_ERROR",
        );
      }

      data.phone = phone;
    }
  }

  return prisma.user.update({
    where: { id: userId },
    data,
    select: SAFE_USER_SELECT,
  });
}

async function updateDeliveryAddress(userId, body = {}) {
  const allowedFields = ["defaultAddress"];
  const bodyFields = Object.keys(body);

  if (bodyFields.length === 0) {
    throw new AppError(
      400,
      "Vui lòng cung cấp địa chỉ giao hàng",
      "VALIDATION_ERROR",
    );
  }

  const invalidFields = bodyFields.filter(
    (field) => !allowedFields.includes(field),
  );

  if (invalidFields.length > 0) {
    throw new AppError(
      400,
      `Không được phép cập nhật các trường: ${invalidFields.join(", ")}`,
      "VALIDATION_ERROR",
    );
  }

  const defaultAddress = assertString(
    body.defaultAddress,
    "Địa chỉ giao hàng",
    {
      min: 5,
      max: 500,
    },
  );

  return prisma.user.update({
    where: { id: userId },
    data: { defaultAddress },
    select: SAFE_USER_SELECT,
  });
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  changePassword,
  updateProfile,
  updateDeliveryAddress,
};
