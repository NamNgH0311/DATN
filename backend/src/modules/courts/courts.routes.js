const express = require('express');
const controller = require('./courts.controller');
const router = express.Router();
router.get('/courts', controller.list);
router.get('/courts/calendar', controller.calendar);
module.exports = router;
