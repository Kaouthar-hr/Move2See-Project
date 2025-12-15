const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { authenticateToken } = require('../middleware/authEnhanced');
const activityMiddleware = require('../middleware/activityMiddleware');

router.post(
    '/', 
    authenticateToken, 
    serviceController.createService
);

router.get(
    '/',
    authenticateToken, 
    serviceController.getAllServices
);

router.get(
    '/:serviceId', 
    authenticateToken,
    serviceController.getServiceById
);

router.put(
    '/:serviceId', 
    authenticateToken, 
    //activityMiddleware(['Admin']),
    serviceController.updateService
);

router.delete(
    '/:serviceId', 
    authenticateToken, 
    //activityMiddleware(['Admin']),
    serviceController.deleteService
);


// 2.(AgencyService)
router.post(
    '/agency/:agencyId', 
    authenticateToken,
    activityMiddleware(['AGENCY_OWNER', 'Admin']), 
    serviceController.addServiceToAgency
);

router.get(
    '/agency/:agencyId', 
    authenticateToken,
    serviceController.getAgencyServices
);

router.put(
    '/agency/:agencyId/service/:serviceId', 
    authenticateToken, 
    activityMiddleware(['AGENCY_OWNER', 'Admin']),
    serviceController.updateAgencyServicePrice
);

router.delete(
    '/agency/:agencyId/service/:serviceId', 
    authenticateToken, 
    activityMiddleware(['AGENCY_OWNER', 'Admin']),
    serviceController.removeServiceFromAgency
);

module.exports = router;