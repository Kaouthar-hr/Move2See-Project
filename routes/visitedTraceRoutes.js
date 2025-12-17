const express = require('express');
const router = express.Router();
const visitedTraceController = require('../controllers/visitedTracesController');
const { authenticateToken } = require('../middleware/authEnhanced'); 
const activityMiddleware = require('../middleware/activityMiddleware');


router.post(
    '/point', 
    authenticateToken, 
    activityMiddleware(['AGENCY_DRIVER', 'AGENCY_GUIDE', 'ADMIN']), 
    visitedTraceController.addTracePoint
);

router.post(
    '/batch', 
    authenticateToken, 
    activityMiddleware(['AGENCY_DRIVER', 'AGENCY_GUIDE', 'ADMIN']), 
    visitedTraceController.addTraceBatch
);


router.get(
    '/route/:routeId', 
    authenticateToken, 
    activityMiddleware(['AGENCY_OWNER', 'ADMIN']), 
    visitedTraceController.getRouteTraces
);

router.get(
    '/route/:routeId/segment', 
    authenticateToken, 
    activityMiddleware(['AGENCY_OWNER', 'ADMIN']), 
    visitedTraceController.getRouteTraceSegment
);

module.exports = router;