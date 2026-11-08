const AppError = require("../utils/AppError");

function authorize(...allowedRoles) {
  const roles = allowedRoles.flat();

  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return next(
        new AppError(401, "Vui lòng đăng nhập để tiếp tục.", "UNAUTHORIZED"),
      );
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(
        new AppError(
          403,
          "Bạn không có quyền thực hiện thao tác này.",
          "FORBIDDEN",
        ),
      );
    }

    return next();
  };
}

authorize.authorize = authorize;
authorize.roleMiddleware = authorize;

module.exports = authorize;
