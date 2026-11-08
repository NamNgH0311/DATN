const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const AppError = require("../utils/AppError");
const { JWT_ACCESS_SECRET } = require("../config/auth.config");

if (!JWT_ACCESS_SECRET) {
  throw new Error(
    "Lỗi cấu hình nghiêm trọng: Thiếu JWT_ACCESS_SECRET trong môi trường.",
  );
}

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || typeof authHeader !== "string") {
      return next(
        new AppError(401, "Vui lòng đăng nhập để tiếp tục.", "UNAUTHORIZED"),
      );
    }

    const parts = authHeader.trim().split(/\s+/);
    if (
      parts.length !== 2 ||
      parts[0].toLowerCase() !== "bearer" ||
      !parts[1]
    ) {
      return next(
        new AppError(
          401,
          "Token xác thực không hợp lệ.",
          "INVALID_AUTHORIZATION",
        ),
      );
    }

    const token = parts[1];
    let decoded;

    try {
      decoded = jwt.verify(token, JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return next(
          new AppError(401, "Access token đã hết hạn.", "INVALID_ACCESS_TOKEN"),
        );
      }
      return next(
        new AppError(401, "Access token không hợp lệ.", "INVALID_ACCESS_TOKEN"),
      );
    }

    const userId = decoded.sub;
    const sessionId = decoded.sid;

    if (!userId || !sessionId) {
      return next(
        new AppError(
          401,
          "Token không chứa thông tin định danh hợp lệ.",
          "INVALID_ACCESS_TOKEN",
        ),
      );
    }

    const session = await prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId: userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: {
          isActive: true,
        },
      },
      select: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            defaultAddress: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session || !session.user) {
      return next(
        new AppError(
          401,
          "Phiên đăng nhập không tồn tại hoặc đã hết hạn.",
          "INVALID_SESSION",
        ),
      );
    }

    req.user = session.user;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = authMiddleware;
