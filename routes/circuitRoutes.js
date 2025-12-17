const express = require('express');
const circuitController = require('../controllers/circuitController');
const { authenticateToken } = require('../middleware/authEnhanced');
const activityMiddleware = require('../middleware/activityMiddleware');
const { uploadCircuitImage } = require("../config/cloudinary");
const router = express.Router();


router.route('/')
    .post(
        authenticateToken,
        uploadCircuitImage.single('image'),
        activityMiddleware(['AGENCY_OWNER']),
        circuitController.createCircuit
    )
    .get(
        authenticateToken,
        circuitController.getCircuits
    );


// Recherche par Prix (utilise Query: ?minPrice=100&maxPrice=500)
router.get(
    '/by-price',
    authenticateToken,
    circuitController.getCircuitsByPrice
);

// Recherche par Nombre de Places (utilise Query: ?maxSeats=...)
router.get(
    '/by-seats',
    authenticateToken,
    circuitController.getCircuitsBySeats
);

// Recherche par mot-clé (utilise Query: ?keyword=...)
router.get(
    '/search',
    authenticateToken,
    circuitController.searchCircuits
);


router.route('/:id')
    .get(
        authenticateToken,
        circuitController.getCircuitById
    )
    .put(
        authenticateToken,
        uploadCircuitImage.single('image'),
        activityMiddleware(['AGENCY_OWNER']),
        circuitController.updateCircuit
    )
    .delete(
        authenticateToken,
        activityMiddleware(['AGENCY_OWNER']),
        circuitController.deleteCircuit
    );


// Ajouter/Retirer un POI à un circuit
router.post(
    '/poi/add',
    authenticateToken, 
    activityMiddleware(['AGENCY_OWNER']),
    circuitController.addPOIToCircuit
);

router.delete(
    '/poi/remove',
    authenticateToken, 
    activityMiddleware(['AGENCY_OWNER']),
    circuitController.removePOIFromCircuit
);

// Mettre à jour l'ordre des POI 
router.put(
    '/:circuitId/order',
    authenticateToken, 
    activityMiddleware(['AGENCY_OWNER']),
    circuitController.updateCircuitPOIOrder
);

// Récupérer la liste ordonnée des POI du circuit
router.get(
    '/:circuitId/pois',
    authenticateToken,
    circuitController.getCircuitPOIs
);


// Recherche par Agence (utilise Param: /by-agency/UUID)
router.get(
    '/by-agency/:agencyId',
    authenticateToken,
    circuitController.getCircuitsByAgency
);

// Recherche par Ville de Départ (utilise Param: /by-departure/UUID)
router.get(
    '/by-departure/:departureCityId',
    authenticateToken, 
    circuitController.getCircuitsByDeparture
);

// Recherche par Destination (utilise Param: /by-destination/UUID)
router.get(
    '/by-destination/:destinationCityId',
    authenticateToken,
    circuitController.getCircuitsByDestination
);


module.exports = router;