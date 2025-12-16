const { Op, Sequelize } = require('sequelize');
const { Circuit, POI, CircuitPOIs, Agency, POILocalization, Category, City, POIFile, UserAgency } = require('../models'); 

/**
 * [C] Créer un nouveau Circuit
*/
exports.createCircuit = async (req, res) => {
    const transaction = await Circuit.sequelize.transaction();
    
    try {
        const data = req.body;
        const initialPois = data.pois || []; 
        const userId = req.user.userId;
        const userRole = req.user.role;

        // 1. Validation des champs obligatoires
        if (!data.title || !data.agencyId || !data.price) {
            await transaction.rollback();
            return res.status(400).json({ 
                status: 'fail', 
                message: 'Le titre, l\'ID de l\'agence et le prix sont requis.' 
            });
        }

        // 2. Vérification de l'existence de l'agence, son statut et la propriété
        const agencyQuery = {
            where: { 
                id: data.agencyId,
                status: 'active', 
                is_deleted: false 
            },
            transaction
        };

        // Si l'utilisateur n'est pas Admin, on vérifie s'il appartient à cette agence
        if (userRole !== 'Admin') {
            agencyQuery.include = [{
                model: UserAgency,
                as: 'userAgencies', 
                where: { user_id: userId } 
            }];
        }

        const targetAgency = await Agency.findOne(agencyQuery);

        if (!targetAgency) {
            await transaction.rollback();
            return res.status(403).json({ 
                status: 'fail', 
                message: "Accès refusé. L'agence est inactive, supprimée, ou vous n'avez pas les droits sur celle-ci." 
            });
        }
        
        // 3. Validation des POIs (Points d'intérêt)
        const invalidPois = initialPois.filter(p => !p.poiId || typeof p.order !== 'number');
        if (invalidPois.length > 0) {
            await transaction.rollback();
            return res.status(400).json({ 
                status: 'fail', 
                message: 'Chaque POI doit avoir un poiId valide et un order numérique.' 
            });
        }

        // 4. Création du Circuit principal
        const circuitDataToCreate = { ...data };
        delete circuitDataToCreate.pois; 

        const newCircuit = await Circuit.create(circuitDataToCreate, { transaction });
        
        // 5. Création des relations Circuit-POI
        if (initialPois.length > 0) {
            const relations = initialPois.map(item => ({
                circuitId: newCircuit.id,
                poiId: item.poiId,
                order: item.order
            }));

            await CircuitPOIs.bulkCreate(relations, { transaction });
        }
        
        // 6. Validation de la transaction
        await transaction.commit();

        // 7. Récupération du résultat final pour la réponse
        const createdCircuitWithPois = await Circuit.findByPk(newCircuit.id, {
            include: [{ 
                model: POI, 
                as: 'pois',
                where: { isDeleted: false }, 
                required: false,
                through: { attributes: ['order'] }
            }]
        });

        return res.status(201).json({ 
            status: 'success', 
            message: 'Circuit créé avec succès.',
            data: createdCircuitWithPois 
        });

    } catch (error) {
        if (transaction) await transaction.rollback(); 
        
        console.error("❌ Erreur createCircuit:", error.message);
        
        let userMessage = 'Erreur serveur lors de la création du circuit.';
        
        // Gestion des erreurs spécifiques de Sequelize
        if (error.name === 'SequelizeForeignKeyConstraintError') {
             userMessage = "Erreur d'intégrité : L'ID d'agence ou de POI fourni est invalide.";
        } else if (error.name === 'SequelizeValidationError') {
             userMessage = 'Erreur de validation : ' + error.errors.map(e => e.message).join(', ');
        } else if (error.message.includes('alias')) {
             userMessage = "Erreur de configuration du serveur : Alias de relation incorrect.";
        }

        return res.status(500).json({ 
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
                { 
                    model: Agency,
                    as: 'agency' ,
                    where: { 
                    status: 'active', 
                    is_deleted: false  
                }
                },
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
                    as: 'agency' ,
                    where: { 
                    status: 'active', 
                    is_deleted: false  
        }
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
    const userId = req.user.userId;
    const userRole = req.user.role;

    const transaction = await Circuit.sequelize.transaction();

    try {
        // 1. VÉRIFICATION DE SÉCURITÉ ET PROPRIÉTÉ
        // On cherche le circuit, son agence (active) et si l'utilisateur y est lié
        const existingCircuitConditions = {
            where: { id: id, isDeleted: false },
            include: [
                {
                    model: Agency,
                    as: 'agency',
                    where: { 
                        status: 'active', 
                        is_deleted: false 
                    },
                    // Si l'utilisateur n'est pas Admin, on force la vérification de propriété
                    include: userRole !== 'Admin' ? [{
                        model: UserAgency,
                        as: 'userAgencies', 
                        where: { user_id: userId }
                    }] : []
                }
            ],
            transaction
        };

        const existingCircuit = await Circuit.findOne(existingCircuitConditions);

        if (!existingCircuit) {
            await transaction.rollback();
            return res.status(403).json({ 
                status: 'fail',
                message: "Modification impossible : circuit inexistant, agence inactive ou vous n'avez pas les droits nécessaires." 
            });
        }

        // 2. Préparation des données (on exclut 'pois' de la mise à jour directe du modèle Circuit)
        const circuitDataToUpdate = { ...data };
        delete circuitDataToUpdate.pois; 
        delete circuitDataToUpdate.agencyId; // Sécurité : on ne change pas l'agence d'un circuit existant

        // 3. Mise à jour du Circuit principal
        await Circuit.update(circuitDataToUpdate, {
            where: { id: id, isDeleted: false },
            transaction 
        });

        // 4. Gestion des POI associés (si le champ 'pois' est fourni)
        if (initialPois !== undefined) {
            if (!Array.isArray(initialPois)) {
                await transaction.rollback();
                return res.status(400).json({
                    status: 'fail',
                    message: 'Le champ "pois" doit être un tableau.' 
                });
            }

            // A. Supprimer les anciennes associations
            await CircuitPOIs.destroy({ where: { circuitId: id }, transaction });

            // B. Créer les nouvelles associations
            if (initialPois.length > 0) {
                // Validation rapide de la structure des données reçues
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
        
        // 5. Validation de la transaction
        await transaction.commit();

        // 6. Récupération du circuit mis à jour pour la réponse
        const updatedCircuit = await Circuit.findByPk(id, {
            include: [
                { 
                    model: Agency,
                    as: 'agency',
                    attributes: ['id', 'name', 'status']
                },
                { 
                    model: POI, 
                    as: 'pois', 
                    through: { attributes: ['order'] },
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
        if (transaction) await transaction.rollback(); 
        
        console.error("❌ Erreur updateCircuit :", error.message);
        
        let userMessage = 'Erreur serveur lors de la mise à jour du circuit.';
        if (error.name === 'SequelizeForeignKeyConstraintError') {
             userMessage = "Erreur d'intégrité : L'un des POI fournis n'existe pas dans la base de données.";
        } else if (error.name === 'SequelizeValidationError') {
             userMessage = 'Erreur de validation : ' + error.errors.map(e => e.message).join(', ');
        } else if (error.message.includes('alias')) {
             userMessage = "Erreur de configuration : l'alias des relations est incorrect.";
        }

        return res.status(500).json({ 
            status: 'fail', 
            message: userMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * [D] Supprimer logiquement un Circuit
 */
exports.deleteCircuit = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    try {
        // 1. Recherche du circuit avec vérification d'agence et de propriété
        const circuitQuery = {
            where: { id: id },
            include: [{
                model: Agency,
                as: 'agency',
                where: { 
                    status: 'active', 
                    is_deleted: false 
                },
                // Si l'utilisateur n'est pas Admin, on vérifie s'il possède cette agence
                include: userRole !== 'Admin' ? [{
                    model: UserAgency,
                    as: 'userAgencies', 
                    where: { user_id: userId }
                }] : []
            }]
        };

        const circuit = await Circuit.findOne(circuitQuery);

        // Si le circuit n'existe pas ou si l'utilisateur n'a pas les droits
        if (!circuit) {
            return res.status(404).json({ 
                status: 'fail', 
                message: "Impossible de supprimer. Circuit non trouvé, agence inactive ou droits insuffisants." 
            });
        }
        
        // 2. Vérification si déjà supprimé
        if (circuit.isDeleted) {
            return res.status(410).json({ 
                status: 'fail', 
                message: 'Ce circuit est déjà marqué comme supprimé.' 
            });
        }
        
        // 3. Vérification de Contrainte (Futur modèle Booking)
        /*
        const activeBookingsCount = await Booking.count({
            where: {
                circuitId: id,
                status: ['pending', 'confirmed', 'paid']
            }
        });

        if (activeBookingsCount > 0) {
            return res.status(409).json({
                status: 'fail',
                message: `Impossible de supprimer : ${activeBookingsCount} réservation(s) active(s) en cours.`
            });
        }
        */

        // 4. Effectuer la Suppression Logique
        const [updatedRows] = await Circuit.update({ 
            isDeleted: true 
        }, {
            where: { id: id }
        });
        
        // 5. Réponse
        if (updatedRows > 0) {
            return res.status(200).json({ 
                status: 'success', 
                message: `Le circuit a été supprimé avec succès.` 
            });
        }

        return res.status(400).json({ 
            status: 'fail',
            message: 'La mise à jour de suppression a échoué.' 
        });

    } catch (error) {
        console.error("❌ Erreur deleteCircuit:", error.message);
        
        let userMessage = 'Erreur serveur lors de la suppression du circuit.';
        if (error.message.includes('alias')) {
            userMessage = "Erreur de configuration : l'alias des relations est incorrect.";
        }

        return res.status(500).json({ 
            status: 'fail',
            message: userMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    const newOrder = parseInt(order);

    // 1. Validation des entrées
    if (!circuitId || !poiId || isNaN(newOrder) || newOrder < 1) {
        return res.status(400).json({ 
            status: 'fail', 
            message: 'Les IDs du circuit, du POI et un ordre valide (>= 1) sont requis.' 
        });
    }

    const transaction = await Circuit.sequelize.transaction();
    
    try {
        // 2. VÉRIFICATION D'EXISTENCE, STATUT ET PROPRIÉTÉ
        const circuitConditions = {
            where: { id: circuitId, isDeleted: false },
            include: [{
                model: Agency,
                as: 'agency',
                where: { status: 'active', is_deleted: false },
                // Vérification de propriété pour les non-admins
                include: userRole !== 'Admin' ? [{
                    model: UserAgency,
                    as: 'userAgencies',
                    where: { user_id: userId }
                }] : []
            }],
            transaction
        };

        const [circuit, poi] = await Promise.all([
            Circuit.findOne(circuitConditions),
            POI.findByPk(poiId, { transaction, attributes: ['id', 'isDeleted'] })
        ]);

        if (!circuit) {
            await transaction.rollback();
            return res.status(403).json({ 
                status: 'fail',
                message: "Accès refusé ou circuit introuvable (l'agence doit être active)." 
            });
        }

        if (!poi || poi.isDeleted) {
            await transaction.rollback();
            return res.status(404).json({ 
                status: 'fail',
                message: 'POI non trouvé ou désactivé.' 
            });
        }
        
        // 3. VÉRIFIER SI LA RELATION EXISTE DÉJÀ 
        const existingRelation = await CircuitPOIs.findOne({
            where: { circuitId, poiId },
            transaction
        });

        if (existingRelation) {
            await transaction.rollback();
            return res.status(409).json({ 
                status: 'fail', 
                message: 'Ce POI est déjà associé à ce circuit.' 
            });
        }
        
        // 4. GÉRER LE CONFLIT D'ORDRE (Décalage atomique)
        // Décale tous les POI ayant un ordre >= au nouvel ordre
        await CircuitPOIs.increment('order', {
            by: 1,
            where: {
                circuitId: circuitId,
                order: { [Op.gte]: newOrder }
            },
            transaction
        });

        // 5. CRÉER LA NOUVELLE RELATION
        const newRelation = await CircuitPOIs.create({ 
            circuitId,
            poiId,
            order: newOrder 
        }, { transaction });

        // 6. FINALISATION
        await transaction.commit();

        return res.status(201).json({ 
            status: 'success', 
            message: 'POI ajouté et ordre ajusté avec succès.',
            data: newRelation 
        });
        
    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error("❌ Erreur addPOIToCircuit:", error.message);
        
        let userMessage = "Erreur serveur lors de l'ajout du POI.";
        if (error.name === 'SequelizeForeignKeyConstraintError') {
             userMessage = "L'ID du circuit ou du POI est invalide.";
        } else if (error.message.includes('alias')) {
             userMessage = "Erreur de configuration des relations (alias).";
        }
        
        return res.status(500).json({ status: 'fail', message: userMessage });
    }
};

/**
 * Supprimer un POI d'un Circuit
 * - Supprime l'association (CircuitId, PoiId).
 * - Décrémente l'ordre des POI suivants pour maintenir la séquence.
 */
exports.removePOIFromCircuit = async (req, res) => {
    const { circuitId, poiId } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    // 1. Validation des entrées
    if (!circuitId || !poiId) {
        return res.status(400).json({ 
            status: 'fail', 
            message: 'Les IDs du circuit et du POI sont requis.' 
        });
    }

    const transaction = await Circuit.sequelize.transaction();
    
    try {
        // 2. VÉRIFICATION DE SÉCURITÉ ET PROPRIÉTÉ
        // On vérifie que le circuit existe et appartient à l'agence de l'utilisateur
        const circuitConditions = {
            where: { id: circuitId, isDeleted: false },
            include: [{
                model: Agency,
                as: 'agency',
                where: { status: 'active', is_deleted: false },
                include: userRole !== 'Admin' ? [{
                    model: UserAgency,
                    as: 'userAgencies',
                    where: { user_id: userId }
                }] : []
            }],
            transaction
        };

        const circuit = await Circuit.findOne(circuitConditions);

        if (!circuit) {
            await transaction.rollback();
            return res.status(403).json({ 
                status: 'fail',
                message: "Accès refusé ou circuit introuvable (l'agence doit être active)." 
            });
        }

        // 3. TROUVER L'ASSOCIATION EXISTANTE
        const existingRelation = await CircuitPOIs.findOne({
            where: { circuitId, poiId },
            attributes: ['order'],
            transaction
        });

        if (!existingRelation) {
            await transaction.rollback();
            return res.status(404).json({ 
                status: 'fail',
                message: "Ce POI n'est pas associé à ce circuit." 
            });
        }
        
        const removedOrder = existingRelation.order;

        // 4. SUPPRIMER LA RELATION
        await CircuitPOIs.destroy({
            where: { circuitId, poiId },
            transaction
        });

        // 5. RÉAJUSTER L'ORDRE (Combler le trou)
        // Tous les POI ayant un ordre > à celui supprimé descendent de 1 (decrement)
        await CircuitPOIs.decrement('order', {
            by: 1,
            where: {
                circuitId: circuitId,
                order: { [Op.gt]: removedOrder } 
            },
            transaction
        });

        // 6. FINALISATION
        await transaction.commit();

        return res.status(200).json({ 
            status: 'success', 
            message: 'POI retiré du circuit et ordre des POI suivants ajusté avec succès.' 
        });
        
    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error("❌ Erreur removePOIFromCircuit:", error.message);
        
        let userMessage = 'Erreur serveur lors du retrait du POI du circuit.';
        if (error.message.includes('alias')) {
            userMessage = "Erreur de configuration : l'alias des relations est incorrect.";
        }
        
        return res.status(500).json({ status: 'fail', message: userMessage });
    }
};


/**
 * [U] Mettre à jour l'ordre des POI d'un Circuit (reconstruire l'ordre)
 * Stratégie : Supprimer toutes les anciennes relations, créer les nouvelles.
 */
exports.updateCircuitPOIOrder = async (req, res) => {
    const { circuitId } = req.params;
    const { poiIdsOrdered } = req.body; // Tableau de { poiId, order }
    const userId = req.user.userId;
    const userRole = req.user.role;

    // 1. Validation de base des entrées
    if (!Array.isArray(poiIdsOrdered) || poiIdsOrdered.length === 0) {
        return res.status(400).json({ 
            status: 'fail',
            message: 'Une liste ordonnée de POI est requise (tableau non vide).' 
        });
    }
    
    const transaction = await Circuit.sequelize.transaction();

    try {
        // 2. VÉRIFICATION DE SÉCURITÉ ET PROPRIÉTÉ
        // On vérifie l'existence du circuit et l'appartenance à l'agence de l'utilisateur
        const circuitConditions = {
            where: { id: circuitId, isDeleted: false },
            include: [{
                model: Agency,
                as: 'agency',
                where: { status: 'active', is_deleted: false },
                include: userRole !== 'Admin' ? [{
                    model: UserAgency,
                    as: 'userAgencies', 
                    where: { user_id: userId }
                }] : []
            }],
            transaction
        };

        const circuit = await Circuit.findOne(circuitConditions);

        if (!circuit) {
            await transaction.rollback();
            return res.status(403).json({ 
                status: 'fail',
                message: "Accès refusé ou circuit introuvable (l'agence doit être active)." 
            });
        }

        // 3. PRÉPARATION ET VALIDATION DES DONNÉES
        const relations = poiIdsOrdered.map(item => ({
            circuitId,
            poiId: item.poiId,
            order: parseInt(item.order)
        }));
        
        const invalidPois = relations.filter(r => !r.poiId || isNaN(r.order) || r.order < 1);
        if (invalidPois.length > 0) {
            await transaction.rollback();
            return res.status(400).json({ 
                status: 'fail', 
                message: 'Chaque POI doit avoir un poiId valide et un order (nombre positif).' 
            });
        }

        // 4. RÉORGANISATION ATOMIQUE
        // A. Supprimer toutes les anciennes associations pour ce circuit
        await CircuitPOIs.destroy({ where: { circuitId }, transaction }); 

        // B. Recréer les associations avec le nouvel ordre
        await CircuitPOIs.bulkCreate(relations, { transaction });

        // 5. FINALISATION DE LA TRANSACTION
        await transaction.commit();
        
        // 6. RÉCUPÉRATION DU CIRCUIT MIS À JOUR POUR LA RÉPONSE
        const updatedCircuit = await Circuit.findByPk(circuitId, {
            include: [
                { model: Agency, as: 'agency', attributes: ['id', 'name'] },
                { 
                    model: POI, 
                    as: 'pois', 
                    through: { attributes: ['order'] },
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
            message: 'L\'ordre des POI a été mis à jour avec succès.',
            data: updatedCircuit
        });

    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error("❌ Erreur updateCircuitPOIOrder:", error.message);
        
        let userMessage = "Erreur serveur lors de la réorganisation des POI.";
        if (error.name === 'SequelizeForeignKeyConstraintError') {
             userMessage = "L'un des IDs de POI fournis n'existe pas dans la base de données.";
        } else if (error.message.includes('alias')) {
             userMessage = "Erreur de configuration : l'alias des relations est incorrect.";
        }
        
        return res.status(500).json({ status: 'fail', message: userMessage });
    }
};

/**
 * Récupérer la liste ordonnée des POI d'un Circuit
 */
exports.getCircuitPOIs = async (req, res) => {
    try {
        const { circuitId } = req.params;
        
        const circuit = await Circuit.findOne({
            where: { 
                id: circuitId, 
                isDeleted: false 
            },
            include: [
                {
                    model: Agency,
                    as: 'agency',
                    where: { 
                        status: 'active', 
                        is_deleted: false 
                    },
                    attributes: ['id', 'name', 'status'] 
                },
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
            order: [
                [{ model: POI, as: 'pois' }, CircuitPOIs, 'order', 'ASC'] 
            ]
        });

        // 2. Si le circuit n'est pas trouvé OU si l'agence est inactive (le where dans l'include annulera le résultat)
        if (!circuit) {
            return res.status(404).json({ 
                status: 'fail',
                message: "Circuit non trouvé ou l'agence associée est inactive." 
            });
        }

        // 3. Renvoyer les POI
        res.status(200).json({ 
            status: 'success', 
            results: circuit.pois ? circuit.pois.length : 0,
            data: circuit.pois 
        });

    } catch (error) {
        console.error("❌ Erreur getCircuitPOIs:", error.message);
        res.status(500).json({ 
            status: 'fail', 
            message: 'Erreur serveur lors de la récupération des POI du circuit.' 
        });
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
                { 
                    model: Agency,
                    as: 'agency' ,
                    where: { 
                    status: 'active', 
                    is_deleted: false
                    }
                },
                
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
                    where: { 
                    status: 'active', 
                    is_deleted: false  
                },
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
                { 
                    model: Agency,
                    as: 'agency' ,
                    where: { 
                    status: 'active', 
                    is_deleted: false   
                    }

                 },
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
                { 
                    model: Agency,
                    as: 'agency',
                    where: { 
                    status: 'active', 
                    is_deleted: false  
                },
                },
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
                { 
                    model: Agency,
                    as: 'agency',
                    where: { 
                    status: 'active', 
                    is_deleted: false  
                },
                },
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
                { 
                    model: Agency,
                    as: 'agency',
                    where: {    
                    status: 'active', 
                    is_deleted: false
                    }
                    },
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