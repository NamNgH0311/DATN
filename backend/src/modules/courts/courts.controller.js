const service = require('./courts.service');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function sportIdOf(req) {
  const id = req.query.sportId;
  if (typeof id !== 'string' || !UUID.test(id)) throw new AppError(400, 'sportId phải là UUID hợp lệ.', 'INVALID_SPORT_ID');
  return id;
}
function dateOf(req) {
  const value = req.query.date;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(400, 'date phải có định dạng YYYY-MM-DD.', 'INVALID_DATE');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== value) throw new AppError(400, 'Ngày không hợp lệ.', 'INVALID_DATE');
  return date;
}
module.exports = {
  list: asyncHandler(async (req,res) => res.json({success:true,data:await service.list(sportIdOf(req))})),
  calendar: asyncHandler(async (req,res) => {
    const sportId = sportIdOf(req);
    const date = dateOf(req);
    const data = await service.calendar(sportId,date);
    res.json({success:true,data});
  }),
};
