const express = require('express');
const circuitController = require('../controllers/circuitController');
const router = express.Router();


router.route('/')
    .post(circuitController.createCircuit)
    .get(circuitController.getCircuits);


// Recherche par Prix (utilise Query: ?minPrice=100&maxPrice=500)
router.get(
    '/by-price',
    circuitController.getCircuitsByPrice
);

// Recherche par Nombre de Places (utilise Query: ?maxSeats=...)
router.get(
    '/by-seats',
    circuitController.getCircuitsBySeats
);

// Recherche par mot-clé (utilise Query: ?keyword=...)
router.get(
    '/search',
    circuitController.searchCircuits
);


router.route('/:id')
    .get(circuitController.getCircuitById)
    .put(circuitController.updateCircuit)
    .delete(circuitController.deleteCircuit);


// Ajouter/Retirer un POI à un circuit
router.post(
    '/poi/add',
    circuitController.addPOIToCircuit
);

router.delete(
    '/poi/remove',
    circuitController.removePOIFromCircuit
);

// Mettre à jour l'ordre des POI 
router.put(
    '/:circuitId/order',
    circuitController.updateCircuitPOIOrder
);

// Récupérer la liste ordonnée des POI du circuit
router.get(
    '/:circuitId/pois',
    circuitController.getCircuitPOIs
);


// Recherche par Agence (utilise Param: /by-agency/UUID)
router.get(
    '/by-agency/:agencyId',
    circuitController.getCircuitsByAgency
);

// Recherche par Ville de Départ (utilise Param: /by-departure/UUID)
router.get(
    '/by-departure/:departureCityId',
    circuitController.getCircuitsByDeparture
);

// Recherche par Destination (utilise Param: /by-destination/UUID)
router.get(
    '/by-destination/:destinationCityId',
    circuitController.getCircuitsByDestination
);


module.exports = router;