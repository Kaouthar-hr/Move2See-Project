const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');
const { authenticateToken } = require('../middleware/authEnhanced'); 
const activityMiddleware = require('../middleware/activityMiddleware');


router.post('/create', authenticateToken, routeController.createRoute);

router.get('/', authenticateToken, routeController.getRoutes);

router.get('/search', authenticateToken, routeController.searchRoutes);

//assignDriver
router.patch(
    '/assignDriver',
    authenticateToken,
    activityMiddleware(['AGENCY_OWNER', 'ADMIN']),
    routeController.assignDriver
);

router.get(
    '/:id', 
    authenticateToken, 
    routeController.getRouteById
);

router.patch(
    '/:id', 
    authenticateToken,
    routeController.updateRoute
);

router.delete(
    '/:id',
    authenticateToken,
    routeController.deleteRoute
);

//getRoutesByUser
router.get(
    '/user/:userId',
    authenticateToken,
    routeController.getRoutesByUser
);

//getRoutesByAgency
router.get(
    '/agency/:agencyId',
    authenticateToken,
    routeController.getRoutesByAgency
);

//getRoutesByCircuit
router.get(
    '/circuit/:circuitId',
    authenticateToken,
    routeController.getRoutesByCircuit
);

router.patch('/:routeId/settings', authenticateToken, routeController.updateRouteSettings);

router.patch('/:routeId/start', authenticateToken, routeController.startRoute);
router.patch('/:routeId/pause', authenticateToken, routeController.pauseRoute);
router.patch('/:routeId/resume', authenticateToken, routeController.resumeRoute);
router.patch('/:routeId/end', authenticateToken, routeController.endRoute);

router.patch(
    '/:routeId/cancel', 
    authenticateToken, 
    activityMiddleware(['AGENCY_OWNER', 'ADMIN']) , 
    routeController.cancelRoute
);
module.exports = router;