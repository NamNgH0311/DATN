function notFoundMiddleware(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Không tìm thấy đường dẫn: ${req.originalUrl}`,
  });
}

module.exports = notFoundMiddleware;