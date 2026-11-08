const authService = require("./auth.service");

async function register(req, res) {
  const result = await authService.register(req.body);

  res.status(201).json({
    success: true,
    data: result,
  });
}

async function login(req, res) {
  const result = await authService.login(req.body);

  res.status(200).json({
    success: true,
    data: result,
  });
}

async function refresh(req, res) {
  const result = await authService.refresh(req.body);

  res.status(200).json({
    success: true,
    data: result,
  });
}

async function logout(req, res) {
  const result = await authService.logout(req.body);

  res.status(200).json({
    success: true,
    data: result,
  });
}

async function changePassword(req, res) {
  const result = await authService.changePassword(req.user.id, req.body);

  res.status(200).json({ success: true, data: result });
}

function getMe(req, res) {
  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
}

async function updateProfile(req, res) {
  const user = await authService.updateProfile(req.user.id, req.body);

  res.status(200).json({
    success: true,
    data: { user },
  });
}

async function updateDeliveryAddress(req, res) {
  const user = await authService.updateDeliveryAddress(req.user.id, req.body);

  res.status(200).json({
    success: true,
    data: { user },
  });
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  changePassword,
  getMe,
  updateProfile,
  updateDeliveryAddress,
};
