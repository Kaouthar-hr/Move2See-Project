const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authEnhanced');
const agencyController = require('../controllers/agencyController');
const activityMiddleware = require('../middleware/activityMiddleware');
const { uploadAgencyFiles } = require('../config/cloudinary');

router.post(
    '/', 
    authenticateToken,
    uploadAgencyFiles, 
    agencyController.createAgency
);

router.get(
    '/',
    authenticateToken,
    agencyController.getAgencies
);

router.get(
    '/:agencyId',
    authenticateToken,
    agencyController.getAgency
);

router.put(
    '/:agencyId', 
    authenticateToken,
    uploadAgencyFiles, 
    activityMiddleware(['AGENCY_OWNER', 'Admin']), 
    agencyController.updateAgency
);
router.delete(
    '/:agencyId', 
    authenticateToken,
    activityMiddleware(['AGENCY_OWNER', 'Admin']), 
    agencyController.deleteAgency
);


router.post(
    '/:agencyId/member', 
     authenticateToken,
     activityMiddleware(['AGENCY_OWNER']), 
    agencyController.addMemberToAgency
);


router.delete(
    '/:agencyId/member/:memberId', 
    authenticateToken,
    activityMiddleware(['AGENCY_OWNER']), 
    agencyController.removeMemberFromAgency
);


module.exports = router;