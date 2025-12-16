const { Op, Sequelize } = require('sequelize');
const { Circuit, POI, CircuitPOIs, Agency, POILocalization, Category, City, POIFile } = require('../models'); 

/**
 * [C] Créer un nouveau Circuit
*/
exports.createCircuit = async (req, res) => {

    const transaction = await Circuit.sequelize.transaction();
    
    try {
        const data = req.body;
        const initialPois = data.pois || []; 

        if (!data.title || !data.agencyId || !data.price) {
            await transaction.rollback();
            return res.status(400).json({ 
                status: 'fail', 
                message: 'Le titre, l\'ID de l\'agence et le prix sont requis pour créer un circuit.' 
            });
        }
        
        const invalidPois = initialPois.filter(p => !p.poiId || typeof p.order !== 'number');
        if (invalidPois.length > 0) {
            await transaction.rollback();
             return res.status(400).json({ 
                status: 'fail', 
                message: 'Chaque POI initial doit avoir un poiId (UUID) et un order (nombre).' 
            });
        }

        // 2. Création du Circuit principal
        const circuitDataToCreate = { ...data };
        delete circuitDataToCreate.pois; 

        const newCircuit = await Circuit.create(circuitDataToCreate, { transaction });
        
        // 3. Gestion des POI initiaux (Association)
        if (initialPois.length > 0) {
            const relations = initialPois.map(item => ({
                circuitId: newCircuit.id,
                poiId: item.poiId,
                order: item.order
            }));

            await CircuitPOIs.bulkCreate(relations, { transaction });
        }
        
          // 4. Validation et Réponse Finale
        await transaction.commit();

        
        const createdCircuitWithPois = await Circuit.findByPk(newCircuit.id, {
            include: [{ 
                model: POI, 
                as: 'pois',
                where: { isDeleted: false }, 
                through: { attributes: ['order'] },
                order: [[{ model: CircuitPOIs, as: 'circuitPOIs' }, 'order', 'ASC']]
            }]
        });

      

        res.status(201).json({ 
            status: 'success', 
            message: 'Circuit créé avec succès, y compris les POI associés.',
            data: createdCircuitWithPois 
        });

    } catch (error) {
        // En cas d'erreur (même une erreur de clé étrangère ou de validation Sequelize), on annule tout
        await transaction.rollback(); 
        
        console.error("❌ Erreur createCircuit (transaction annulée):", error.message);
        
        let userMessage = 'Erreur serveur lors de la création du circuit.';
        if (error.name === 'SequelizeForeignKeyConstraintError') {
             userMessage = 'Erreur: L\'ID d\'agence, ou un des ID de POI, ou un autre ID de clé étrangère est invalide.';
        } else if (error.name === 'SequelizeValidationError') {
             userMessage = 'Erreur de validation des données : ' + error.errors.map(e => e.message).join(', ');
        }
        
        res.status(500).json({ 
            status: 'fail', 
            message: userMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * [R] Récupérer tous les Circuits (avec Agence et POI ordonnés)
 */
exports.getCircuits = async (req, res) => {

    try {
        const circuits = await Circuit.findAll({
            where: { isDeleted: false },
            include: [
                { model: Agency, as: 'agency' },
                { 
                    model: POI, 
                    as: 'pois', 
                    through: {
                        model: CircuitPOIs, 
                        attributes: ['order'] 
                    },
                    required: false, 
                    where: { isDeleted: false }
                }
            ],
            // 3. Trier les POI inclus par leur ordre de visite
            order: [
                ['createdAt', 'DESC'], 
                [
                    { model: POI, as: 'pois' }, 
                    'circuitPOIs',              
                    'order', 
                    'ASC'
                ]
            ]
        });
        
        res.status(200).json({ status: 'success', data: circuits });
    } catch (error) {
        console.error("❌ Erreur getCircuits:", error);
        res.status(500).json({ 
            status: 'fail',
            message: 'Erreur serveur lors de la récupération des circuits' 
        });
    }
};

/**
 * [R] Récupérer un Circuit par ID
 */
/**
 * [R] Récupérer un Circuit par ID avec ses POI ordonnés
 */
exports.getCircuitById = async (req, res) => {
    try {
        const { id } = req.params;

        const circuit = await Circuit.findOne({
            where: { 
                id: id, 
                isDeleted: false 
            },
            include: [
                // 1. Inclusion de l'Agence
                { 
                    model: Agency, 
                    as: 'agency' 
                },
                // 2. Inclusion des POIs avec leurs détails et localisations
                { 
                    model: POI, 
                    as: 'pois', 
                    required: false,
                    include: [
                        { model: POILocalization, as: 'frLocalization', required: false },
                        { model: POILocalization, as: 'arLocalization', required: false },
                        { model: POILocalization, as: 'enLocalization', required: false },
                        { model: Category, as: 'categoryPOI', required: false },
                        { model: City, as: 'city', required: false },
                        { model: POIFile, as: 'files', required: false }
                    ],
                    through: { 
                        model: CircuitPOIs,
                        attributes: ['order'] 
                    },
                    where: { isDeleted: false },
                    required: false
                }
            ],
            order: [
                [{ model: POI, as: 'pois' }, CircuitPOIs, 'order', 'ASC']
            ]
        });

        if (!circuit) {
            return res.status(404).json({ 
                status: 'fail',
                message: 'Circuit non trouvé' 
            });
        }

        res.status(200).json({ 
            status: 'success',
            data: circuit 
        });

    } catch (error) {
        console.error("❌ Erreur getCircuitById:", error);
        res.status(500).json({ 
            status: 'fail',
            message: 'Erreur serveur',
            error: error.message 
        });
    }
};

/**
 * [U] Mettre à jour un Circuit
 * Permet de mettre à jour les champs du circuit ET,
 * si un tableau 'pois' est fourni, il reconstruira l'intégralité de la liste des POI ordonnés.
 */
exports.updateCircuit = async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    const initialPois = data.pois; 

    const transaction = await Circuit.sequelize.transaction();

    try {
        
        // On exclut 'pois' du corps pour la mise à jour du modèle Circuit principal
        const circuitDataToUpdate = { ...data };
        delete circuitDataToUpdate.pois; 

        // 2. Mise à jour du Circuit principal
        const [updatedRows] = await Circuit.update(circuitDataToUpdate, {
            where: { id: id, isDeleted: false },
            transaction 
        });

        if (updatedRows === 0) {
            await transaction.rollback();
            return res.status(404).json({ 
                status: 'fail',
                message: 'Circuit non trouvé ou non modifiable' 
            });
        }

        // 3. Gestion des POI associés (si le champ 'pois' est présent)
        if (initialPois !== undefined) {
            if (!Array.isArray(initialPois)) {
                await transaction.rollback();
                return res.status(400).json({
                     status: 'fail',
                     message: 'Le champ "pois" doit être un tableau.' 
                    });
            }

            // A. Supprimer toutes les anciennes associations pour ce circuit
            await CircuitPOIs.destroy({ where: { circuitId: id }, transaction });

            // B. Créer les nouvelles associations avec le nouvel ordre
            if (initialPois.length > 0) {
                const relations = initialPois.map(item => ({
                    circuitId: id,
                    poiId: item.poiId,
                    order: item.order
                }));
                
                const invalidPois = relations.filter(r => !r.poiId || typeof r.order !== 'number');
                if (invalidPois.length > 0) {
                    await transaction.rollback();
                    return res.status(400).json({ 
                        status: 'fail', 
                        message: 'Chaque POI doit avoir un poiId (UUID) et un order (nombre).' 
                    });
                }

                await CircuitPOIs.bulkCreate(relations, { transaction });
            }
        }
        
        // 4. Finalisation et Récupération des données mises à jour
        await transaction.commit();

        const updatedCircuit = await Circuit.findByPk(id, {
            include: [
                { model: Agency, as: 'agency' },
                { 
                    model: POI, 
                    as: 'pois', 
                    through: { model: CircuitPOIs, attributes: ['order'] },
                    where: { isDeleted: false },
                    required: false 
                }
            ],
            order: [
                [{ model: POI, as: 'pois' }, CircuitPOIs, 'order', 'ASC'] 
            ]
        });

        return res.status(200).json({ 
            status: 'success', 
            message: 'Circuit mis à jour avec succès.',
            data: updatedCircuit 
        });

    } catch (error) {

        await transaction.rollback(); 
        
        console.error("❌ Erreur updateCircuit (transaction annulée):", error.message);
        
        let userMessage = 'Erreur serveur lors de la mise à jour du circuit.';
        if (error.name === 'SequelizeForeignKeyConstraintError') {
             userMessage = 'Erreur de clé étrangère : Un ID de POI ou d\'agence est invalide.';
        } else if (error.name === 'SequelizeValidationError') {
             userMessage = 'Erreur de validation des données : ' + error.errors.map(e => e.message).join(', ');
        }

        res.status(500).json({ 
            status: 'fail', 
            message: userMessage
        });
    }
};

/**
 * [D] Supprimer logiquement un Circuit
 */
exports.deleteCircuit = async (req, res) => {
    const { id } = req.params;
    
    try {

        const circuit = await Circuit.findByPk(id);

        if (!circuit) {
            return res.status(404).json({ 
                status: 'fail', 
                message: `Circuit avec l'ID ${id} non trouvé.` 
            });
        }
        
        if (circuit.isDeleted) {
             return res.status(410).json({ 
                status: 'fail', 
                message: 'Le circuit est déjà marqué comme supprimé.' 
            });
        }
        
        // 2.  Vérification de Contrainte (Essentiel pour l'intégrité)
        // DÉCOMMENTER CE BLOC LORSQUE VOUS AUREZ IMPLÉMENTÉ LE MODÈLE BOOKING
        /*
        const activeBookingsCount = await Booking.count({
            where: {
                circuitId: id,
                status: ['pending', 'confirmed', 'paid'] // Statuts qui empêchent la suppression
            }
        });

        if (activeBookingsCount > 0) {
            return res.status(409).json({ // 409 Conflict
                status: 'fail',
                message: `Impossible de supprimer le circuit. Il a ${activeBookingsCount} réservation(s) active(s) en cours.`
            });
        }
        */

        // 3. Effectuer la Suppression Logique
        const [updated] = await Circuit.update({ 
            isDeleted: true 
        }, {
            where: { id: id }
        });
        
        // 4. Réponse
        if (updated) {
            return res.status(200).json({ 
                status: 'success', 
                message: `Le circuit ID ${id} est déjà marqué comme supprimé.` 
            });
        }

        res.status(404).json({ 
            status: 'fail',
            message: 'Échec de la suppression logique.' 
        });

    } catch (error) {
        console.error("❌ Erreur deleteCircuit:", error);
        res.status(500).json({ 
            status: 'fail',
            message: 'Erreur serveur lors de la suppression du circuit.' 
        });
    }
};


/**
 * Ajouter un POI à un Circuit avec un ordre
 * - Vérifie l'existence du Circuit et du POI.
 * - Gère l'unicité de la relation (CircuitId, PoiId).
 * - Gère les conflits d'ordre en décalant les POI existants.
 */
exports.addPOIToCircuit = async (req, res) => {

    const { circuitId, poiId, order } = req.body;
    
    const newOrder = parseInt(order);

    if (!circuitId || !poiId || isNaN(newOrder) || newOrder < 1) {
        return res.status(400).json({ 
            status: 'fail', 
            message: 'Les IDs du circuit, du POI et un ordre de visite valide (>= 1) sont requis.' 
        });
    }

    const transaction = await Circuit.sequelize.transaction();
    
    try {
        // 1.  Vérifier l'existence du Circuit et du POI
        const [circuit, poi] = await Promise.all([
            Circuit.findByPk(circuitId, { transaction, attributes: ['id'] }),
            POI.findByPk(poiId, { transaction, attributes: ['id', 'isDeleted'] })
        ]);

        if (!circuit) {
            await transaction.rollback();
            return res.status(404).json({ 
                status: 'fail',
                message: 'Circuit non trouvé.' 
            });
        }
        if (!poi || poi.isDeleted) {
            await transaction.rollback();
            return res.status(404).json({ 
                status: 'fail',
                message: 'POI non trouvé ou désactivé.' 
            });
        }
        
        // 2.  Vérifier si la relation existe déjà 
        const existingRelation = await CircuitPOIs.findOne({
            where: { circuitId, poiId },
            transaction
        });

        if (existingRelation) {
            await transaction.rollback();
            return res.status(409).json({ 
                status: 'fail', 
                message: 'Ce POI est déjà associé à ce circuit. Utilisez la mise à jour pour changer son ordre.' 
            });
        }
        
        // 3. Gérer le Conflit d'Ordre (Décalage des POI existants)
        // Tous les POI ayant un ordre >= au nouvel ordre sont décalés d'une place.
        await CircuitPOIs.increment('order', {
            by: 1,
            where: {
                circuitId: circuitId,
                order: { [Op.gte]: newOrder }
            },
            transaction
        });

        // 4. Créer la nouvelle relation
        const newRelation = await CircuitPOIs.create({ 
            circuitId,
            poiId,
            order: newOrder 
        }, { transaction });

        // 5. Finalisation
        await transaction.commit();

        res.status(201).json({ 
            status: 'success', 
            message: 'POI ajouté au circuit avec succès et l\'ordre a été ajusté.',
            data: newRelation 
        });
        
    } catch (error) {
        await transaction.rollback();
        console.error("❌ Erreur addPOIToCircuit:", error);
        
        let userMessage = 'Erreur serveur lors de l\'ajout du POI au circuit.';
        if (error.name === 'SequelizeForeignKeyConstraintError') {
             userMessage = 'Erreur de clé étrangère : L\'ID du circuit ou du POI est invalide.';
        }
        
        res.status(500).json({ status: 'fail', message: userMessage });
    }
};

/**
 * Supprimer un POI d'un Circuit
 * - Supprime l'association (CircuitId, PoiId).
 * - Décrémente l'ordre des POI suivants pour maintenir la séquence.
 */
exports.removePOIFromCircuit = async (req, res) => {
    const { circuitId, poiId } = req.body;
    
    if (!circuitId || !poiId) {
        return res.status(400).json({ 
            status: 'fail', 
            message: 'Les IDs du circuit et du POI sont requis.' 
        });
    }

    const transaction = await Circuit.sequelize.transaction();
    
    try {
        // 1. Trouver l'association existante et son ordre
        const existingRelation = await CircuitPOIs.findOne({
            where: { circuitId, poiId },
            attributes: ['order'], // On a besoin de l'ordre pour le décalage
            transaction
        });

        if (!existingRelation) {
            await transaction.rollback();
            return res.status(404).json({ 
                status: 'fail',
                message: 'Association Circuit-POI non trouvée.' 
            });
        }
        
        const removedOrder = existingRelation.order;

        // 2. Supprimer la relation
        await CircuitPOIs.destroy({
            where: { circuitId, poiId },
            transaction
        });

        // 3. Décaler les POI suivants pour combler le trou
        // Tous les POI avec un ordre > à l'ordre supprimé sont décalés de -1.
        await CircuitPOIs.decrement('order', {
            by: 1,
            where: {
                circuitId: circuitId,
                order: { [Op.gt]: removedOrder } 
            },
            transaction
        });

        // 4. Finalisation
        await transaction.commit();

        res.status(200).json({ 
            status: 'success', 
            message: 'POI retiré du circuit et ordre des POI suivants ajusté avec succès.' 
        });
        
    } catch (error) {
        await transaction.rollback();
        console.error("❌ Erreur removePOIFromCircuit:", error);
        
        let userMessage = 'Erreur serveur lors du retrait du POI du circuit.';
        if (error.name === 'SequelizeForeignKeyConstraintError') {
             userMessage = 'Erreur de clé étrangère : L\'ID du circuit ou du POI est invalide.';
        }
        
        res.status(500).json({ status: 'fail', message: userMessage });
    }
};


/**
 * [U] Mettre à jour l'ordre des POI d'un Circuit (reconstruire l'ordre)
 * Stratégie : Supprimer toutes les anciennes relations, créer les nouvelles.
 */
exports.updateCircuitPOIOrder = async (req, res) => {
    const { circuitId } = req.params;
    const { poiIdsOrdered } = req.body; // Array of { poiId, order }

    if (!Array.isArray(poiIdsOrdered) || poiIdsOrdered.length === 0) {
        return res.status(400).json({ 
            status: 'fail',
            message: 'Liste ordonnée de POI invalide ou vide.' 
        });
    }
    
    // Démarrer une transaction
    const transaction = await Circuit.sequelize.transaction();

    try {
        // 1.  Vérifier l'existence du Circuit
        const circuit = await Circuit.findByPk(circuitId,
            { transaction, attributes: ['id'] }
        );
        if (!circuit) {
            await transaction.rollback();
            return res.status(404).json({ 
                status: 'fail',
                message: 'Circuit non trouvé.' 
            });
        }

        // 2. Supprimer toutes les anciennes associations pour ce circuit
        await CircuitPOIs.destroy({ where: { circuitId }, transaction }); 

        // 3. Préparer les nouvelles associations et valider les données
        const relations = poiIdsOrdered.map(item => ({
            circuitId,
            poiId: item.poiId,
            order: item.order
        }));
        
        // Validation simple : S'assurer que tous les éléments ont un ID et un ordre valide
        const invalidPois = relations.filter(r => !r.poiId || typeof r.order !== 'number' || r.order < 1);
        if (invalidPois.length > 0) {
            await transaction.rollback();
            return res.status(400).json({ 
                status: 'fail', 
                message: 'Chaque POI doit avoir un poiId (UUID) et un order (nombre positif).' 
            });
        }
        
        // 4. Créer les nouvelles associations avec le nouvel ordre
        await CircuitPOIs.bulkCreate(relations, { transaction });

        // 5. Finalisation
        await transaction.commit();
        
        // 6. Renvoyer le circuit mis à jour 
        const updatedCircuit = await Circuit.findByPk(circuitId, {
            include: [
                { model: Agency, as: 'agency' },
                { 
                    model: POI, 
                    as: 'pois', 
                    through: { model: CircuitPOIs, attributes: ['order'] },
                    where: { isDeleted: false },
                    required: false 
                }
            ],
            order: [
                [{ model: POI, as: 'pois' }, CircuitPOIs, 'order', 'ASC'] 
            ]
        });


        res.status(200).json({ 
            status: 'success', 
            message: 'Ordre des POI mis à jour avec succès.',
            data: updatedCircuit
        });

    } catch (error) {
        await transaction.rollback();
        console.error("❌ Erreur updateCircuitPOIOrder:", error);
        
        let userMessage = 'Erreur serveur lors de la mise à jour de l\'ordre des POI.';
        if (error.name === 'SequelizeForeignKeyConstraintError') {
             userMessage = 'Erreur de clé étrangère : L\'un des IDs de POI fournis est invalide.';
        }
        
        res.status(500).json({ status: 'fail', message: userMessage });
    }
};

/**
 * Récupérer la liste ordonnée des POI d'un Circuit
 */
exports.getCircuitPOIs = async (req, res) => {
    try {
        const { circuitId } = req.params;
        
        const circuit = await Circuit.findByPk(circuitId, {
            include: [
                { 
                    model: POI, 
                    as: 'pois', 
                    include: [
                        { model: POILocalization, as: 'frLocalization', required: false },
                        { model: POILocalization, as: 'arLocalization', required: false },
                        { model: POILocalization, as: 'enLocalization', required: false },
                        { model: Category, as: 'categoryPOI', required: false },
                        { model: City, as: 'city', required: false },
                        { model: POIFile, as: 'files', required: false }
                    ],
                    through: { model: CircuitPOIs, attributes: ['order'] },
                    where: { isDeleted: false }, 
                    required: false
                }
            ],
            // 3. Trier les résultats
            order: [
                ['createdAt', 'DESC'], 
                [{ model: POI, as: 'pois' }, CircuitPOIs, 'order', 'ASC'] 
            ]
        });

        if (!circuit) {
            return res.status(404).json({ 
                status: 'fail',
                message: 'Circuit non trouvé' 
            });
        }

        // Renvoyer uniquement les POI (qui sont déjà triés par la requête)
        res.status(200).json({ status: 'success', data: circuit.pois });

    } catch (error) {
        console.error("❌ Erreur getCircuitPOIs:", error);
        res.status(500).json({ status: 'fail', message: 'Erreur serveur' });
    }
};


// ----------------------------------------------------
//   filtres
// ----------------------------------------------------


/**
 * Récupère les Circuits par Agence
 */
exports.getCircuitsByAgency = async (req, res) => {
    try {
        const { agencyId } = req.params; 

        if (!agencyId) {
            return res.status(400).json({ 
                status: 'fail',
                message: "L'ID de l'agence est requis." 
            });
        }
        
        const circuits = await Circuit.findAll({
            where: { agencyId: agencyId, isDeleted: false },
            include: [
                // 1. Inclusion de l'Agence
                { model: Agency, as: 'agency' },
                
                // 2. Inclusion complète des POI ordonnés
                { 
                    model: POI, 
                    as: 'pois', 
                    include: [
                        { model: POILocalization, as: 'frLocalization', required: false },
                        { model: POILocalization, as: 'arLocalization', required: false },
                        { model: POILocalization, as: 'enLocalization', required: false },
                        { model: Category, as: 'categoryPOI', required: false },
                        { model: City, as: 'city', required: false },
                        { model: POIFile, as: 'files', required: false }
                    ],
                    through: { model: CircuitPOIs, attributes: ['order'] },
                    where: { isDeleted: false }, 
                    required: false
                }
            ],
            // 3. Trier les résultats
            order: [
                ['createdAt', 'DESC'], 
                [{ model: POI, as: 'pois' }, CircuitPOIs, 'order', 'ASC'] 
            ]
        });
        
        if (circuits.length === 0) {
            return res.status(404).json({ 
                status: 'fail', 
                message: "Aucun circuit trouvé pour cette agence ou l'agence n'existe pas." 
            });
        }
        
        res.status(200).json({ 
            status: 'success',
            data: circuits 
        });
    } catch (error) {
        console.error("❌ Erreur getCircuitsByAgency:", error);
        res.status(500).json({ status: 'fail', message: 'Erreur serveur' });
    }
};


/**
 * Récupère les Circuits par Fourchette de Prix (Min/Max)
 */
exports.getCircuitsByPrice = async (req, res) => {
    try {
        const { minPrice, maxPrice } = req.query; 

        // Conversion sécurisée
        const min = parseFloat(minPrice) || 0;
        const max = parseFloat(maxPrice) || Number.MAX_SAFE_INTEGER;

        const circuits = await Circuit.findAll({
            where: {
                price: {
                    [Op.gte]: min,
                    [Op.lte]: max
                },
                isDeleted: false
            },
            include: [
                { 
                    model: Agency, 
                    as: 'agency',
                    required: false 
                },
                { 
                    model: POI, 
                    as: 'pois', 
                    required: false, 
                    include: [
                        { model: POILocalization, as: 'frLocalization', required: false },
                        { model: POILocalization, as: 'arLocalization', required: false },
                        { model: POILocalization, as: 'enLocalization', required: false },
                        { model: Category, as: 'categoryPOI', required: false },
                        { model: City, as: 'city', required: false }
                    ],
                    through: { 
                        model: CircuitPOIs, 
                        attributes: ['order'] 
                    },
                    where: { isDeleted: false },
                    required: false 
                }
            ],
            order: [
                ['price', 'ASC'],
                [{ model: POI, as: 'pois' }, CircuitPOIs, 'order', 'ASC']
            ]
        });

        if (!circuits || circuits.length === 0) {
            return res.status(404).json({ 
                status: 'fail', 
                message: `Aucun circuit trouvé entre ${min} et ${max} MAD. Vérifiez que isDeleted est false en base.` 
            });
        }
        
        res.status(200).json({ 
            status: 'success', 
            count: circuits.length,
            data: circuits 
        });

    } catch (error) {
        console.error("❌ Erreur getCircuitsByPrice:", error);
        res.status(500).json({ 
            status: 'fail', 
            message: 'Erreur serveur',
            error: error.message 
        });
    }
};


/**
 * Récupère les Circuits par Nombre de Places Max
 */
exports.getCircuitsBySeats = async (req, res) => {
    try {
        const { maxSeats } = req.query; 
        const max = parseInt(maxSeats, 10);

        if (isNaN(max) || max <= 0) {
            return res.status(400).json({ 
                status: 'fail', 
                message: 'Le nombre de places maxSeats est requis et doit être un nombre positif.' 
            });
        }

        const circuits = await Circuit.findAll({
            where: {
                seats: {
                    [Op.lte]: max 
                },
                isDeleted: false
            },
            include: [
                { model: Agency, as: 'agency', required: false },
                { 
                    model: POI, 
                    as: 'pois', 
                    required: false,
                    include: [
                        { model: POILocalization, as: 'frLocalization', required: false },
                        { model: POILocalization, as: 'arLocalization', required: false },
                        { model: Category, as: 'categoryPOI', required: false },
                        { model: City, as: 'city', required: false }
                    ],
                    through: { model: CircuitPOIs, attributes: ['order'] },
                    where: { isDeleted: false },
                    required: false 
                }
            ],
            order: [
                ['seats', 'DESC'], 
                [{ model: POI, as: 'pois' }, CircuitPOIs, 'order', 'ASC']
            ]
        });

        if (!circuits || circuits.length === 0) {
            return res.status(404).json({ 
                status: 'fail', 
                message: `Aucun circuit trouvé avec un maximum de ${max} places.` 
            });
        }
        
        res.status(200).json({ 
            status: 'success', 
            count: circuits.length,
            data: circuits 
        });

    } catch (error) {
        console.error("❌ Erreur getCircuitsBySeats:", error);
        res.status(500).json({ status: 'fail', message: 'Erreur serveur' });
    }
};

/**
 * Récupère les Circuits par Ville de Départ
 */
exports.getCircuitsByDeparture = async (req, res) => {
    try {
        const { departureCityId } = req.params; 

        const circuits = await Circuit.findAll({
            where: { 
                departureCity: departureCityId, 
                isDeleted: false 
            },
            include: [
                { model: Agency, as: 'agency', required: false },
                { 
                    model: POI, 
                    as: 'pois', 
                    include: [
                        { model: POILocalization, as: 'frLocalization', required: false },
                        { model: POILocalization, as: 'arLocalization', required: false },
                        { model: POILocalization, as: 'enLocalization', required: false },
                        { model: Category, as: 'categoryPOI', required: false }
                    ],
                    through: { model: CircuitPOIs, attributes: ['order'] },
                    where: { isDeleted: false },
                    required: false
                }
            ]
        });
        
        if (!circuits || circuits.length === 0) {
            return res.status(404).json({ 
                status: 'fail',
                message: 'Aucun circuit trouvé pour cette ville de départ.' 
            });
        }

        res.status(200).json({ status: 'success', data: circuits });
    } catch (error) {
        console.error("❌ Erreur getCircuitsByDeparture:", error);
        res.status(500).json({ status: 'fail', message: 'Erreur serveur' });
    }
};

/**
 * Récupère les Circuits par Ville de Destination
 */
exports.getCircuitsByDestination = async (req, res) => {
    try {
        const { destinationCityId } = req.params; 
        
        const circuits = await Circuit.findAll({
            where: { 
                destinationCity: destinationCityId,
                isDeleted: false 
            },
            include: [
                { model: Agency, as: 'agency', required: false },
                { 
                    model: POI, 
                    as: 'pois', 
                    include: [
                        { model: POILocalization, as: 'frLocalization', required: false },
                        { model: POILocalization, as: 'arLocalization', required: false },
                        { model: POILocalization, as: 'enLocalization', required: false }


                    ],
                    through: { model: CircuitPOIs, attributes: ['order'] },
                    where: { isDeleted: false },
                    required: false
                }
            ]
        });
        
        if (!circuits || circuits.length === 0) {
            return res.status(404).json({ 
                status: 'fail', 
                message: 'Aucun circuit trouvé pour cette destination.' 
            });
        }

        res.status(200).json({ status: 'success', data: circuits });
    } catch (error) {
        console.error("❌ Erreur getCircuitsByDestination:", error);
        res.status(500).json({ status: 'fail', message: 'Erreur serveur' });
    }
};


/**
 * Recherche de Circuits par Mot-clé dans le Titre ou la Description
 */
exports.searchCircuits = async (req, res) => {
    try {
        const keyword = req.query.keyword ? req.query.keyword.trim() : '';

        if (!keyword) {
            return res.status(400).json({ 
                status: 'fail', 
                message: "Le mot-clé de recherche est requis." 
            });
        }

        const searchPattern = `%${keyword}%`;

        const circuits = await Circuit.findAll({
            where: {
                isDeleted: false,
                [Op.or]: [
                    { title: { [Op.like]: searchPattern } }, 
                    { description: { [Op.like]: searchPattern } }
                ]
            },
            include: [
                { model: Agency, as: 'agency', required: false },
                { 
                    model: POI, 
                    as: 'pois', 
                    include: [
                        { model: POILocalization, as: 'frLocalization', required: false },
                        { model: POILocalization, as: 'arLocalization', required: false },
                        { model: Category, as: 'categoryPOI', required: false }
                    ],
                    through: { model: CircuitPOIs, attributes: ['order'] },
                    where: { isDeleted: false },
                    required: false
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        res.status(200).json({
            status: 'success',
            count: circuits.length,
            message: `${circuits.length} circuit(s) trouvé(s) pour: "${keyword}"`,
            data: circuits
        });

    } catch (error) {
        console.error("❌ Erreur searchCircuits:", error);
        res.status(500).json({ status: 'fail', message: 'Erreur serveur' });
    }
};