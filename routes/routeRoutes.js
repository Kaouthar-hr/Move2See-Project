const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');
const { authenticateToken } = require('../middleware/authEnhanced'); 


router.post('/create', authenticateToken, routeController.createRoute);

router.get('/', authenticateToken, routeController.getRoutes);

module.exports = router;