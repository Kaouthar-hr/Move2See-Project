const express = require('express');
const router = express.Router();
const agencyVehicleController = require('../controllers/agencyVehicleController');
const { authenticateToken } = require('../middleware/authEnhanced');
const activityMiddleware = require('../middleware/activityMiddleware');
const { uploadAgencyFiles } = require('../config/cloudinary');


router.get(
    '/:agencyId/vehicles', 
    authenticateToken,
     agencyVehicleController.getAgencyVehicles
);

router.post(
    '/:agencyId/vehicles', 
    authenticateToken, 
    uploadAgencyFiles, 
    agencyVehicleController.createAgencyVehicle
);

router.put(
    '/vehicles/:vehicleId', 
    authenticateToken, 
    uploadAgencyFiles, 
    agencyVehicleController.updateAgencyVehicle
);

router.delete(
    '/vehicles/:vehicleId', 
    authenticateToken, 
    agencyVehicleController.deleteAgencyVehicle
);

module.exports = router;