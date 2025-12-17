const { Route, Circuit, AgencyVehicle, VisitedTrace, POI, UserActivity, Activity, UserAgency, Agency, User, POILocalization, POIFile } = require("../models");
const { Op } = require("sequelize");
const crypto = require('crypto');

exports.createRoute = async (req, res) => {
    const transaction = await Route.sequelize.transaction();
    
    try {
        const { circuitId, vehicleId, dateStart, hours, price, seats } = req.body;
        const userId = req.user.userId;
        const userRole = req.user.role; 

        // 1. VÉRIFICATION DU CIRCUIT ET DE L'AGENCE ACTIVE
        const circuit = await Circuit.findOne({
            where: { id: circuitId, isDeleted: false },
            include: [
                {
                    model: Agency,
                    as: 'agency',
                    where: { status: 'active', is_deleted: false }
                },
                {
                    model: POI,
                    as: 'pois',
                    through: { attributes: ['order'] }
                }
            ],
            transaction
        });

        if (!circuit) {
            await transaction.rollback();
            return res.status(404).json({ 
                status: 'fail', 
                message: "Circuit introuvable ou l'agence est inactive." 
            });
        }

        const targetAgencyId = circuit.agencyId;

        // 2. VÉRIFICATION DE L'APPARTENANCE ET DU RÔLE (Correction Pivot User)
        if (userRole !== 'Admin') {
            // On vérifie sur l'User s'il a le bon membership ET la bonne activité
            const userWithPermissions = await User.findOne({
                where: { id: userId },
                include: [
                    {
                        model: UserAgency,
                        as: 'memberships',
                        where: { agency_id: targetAgencyId },
                        required: true // Force l'appartenance à l'agence
                    },
                    {
                        model: UserActivity,
                        as: 'userActivities',
                        required: true, // Force la possession d'un rôle
                        include: [{
                            model: Activity,
                            as: 'activity',
                            where: {
                                name: { [Op.in]: ["AGENCY_OWNER", "AGENCY_DRIVER", "AGENCY_GUIDE"] }
                            }
                        }]
                    }
                ],
                transaction
            });

            if (!userWithPermissions) {
                await transaction.rollback();
                return res.status(403).json({ 
                    status: 'fail', 
                    message: "Accès refusé. Vous n'avez pas les droits requis ou n'appartenez pas à cette agence." 
                });
            }
        }

        // 3. VÉRIFICATION DU VÉHICULE
        const vehicle = await AgencyVehicle.findOne({
            where: { 
                id: vehicleId, 
                agency_id: targetAgencyId 
            },
            transaction
        });

        if (!vehicle) {
            await transaction.rollback();
            return res.status(400).json({ 
                status: 'fail', 
                message: "Le véhicule sélectionné n'existe pas ou n'appartient pas à l'agence du circuit." 
            });
        }

        // 4. CRÉATION DE LA ROUTE
        const newRoute = await Route.create({
            id: crypto.randomUUID(),
            circuitId,
            userId, // Créateur du trajet
            vehicleId,
            dateStart,
            hours,
            price: price || circuit.price,
            seats: seats || vehicle.capacity,
            status: 'scheduled'
        }, { transaction });

        // 5. INITIALISATION DES ÉTAPES (VisitedTraces)
        if (circuit.pois && circuit.pois.length > 0) {
            const traces = circuit.pois.map((poi) => ({
                id: crypto.randomUUID(),
                routeId: newRoute.id,
                poiId: poi.id,
                order: poi.CircuitPOIs ? poi.CircuitPOIs.order : 0,
                status: 'pending'
            }));
            await VisitedTrace.bulkCreate(traces, { transaction });
        }

        await transaction.commit();

        return res.status(201).json({
            status: 'success',
            message: "Trajet créé et étapes initialisées avec succès.",
            data: newRoute
        });

    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error("❌ Erreur createRoute:", error.message);
        return res.status(500).json({ 
            status: 'fail', 
            message: "Erreur serveur lors de la création du trajet.",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined 
        });
    }
};
exports.getRoutes = async (req, res) => {
    try {
        const { status } = req.query;
        const userId = req.user.userId;
        const userRole = req.user.role;

        let whereCondition = {};
        
        // 1. Définition de la condition de base pour le Circuit et l'Agence
        // On s'assure que l'agence est active pour tout le monde sauf potentiellement l'Admin
        let agencyWhere = { status: 'active', is_deleted: false };
        
        // 2. FILTRAGE PAR RÔLE ET PROPRIÉTÉ
        if (userRole !== 'Admin') {
            // Vérifier si l'utilisateur appartient à une agence
            const userMembership = await UserAgency.findOne({
                where: { user_id: userId }
            });

            if (userMembership) {
                // C'est un membre du staff : il voit les trajets de SON agence
                whereCondition['$circuit.agencyId$'] = userMembership.agency_id;
            } else {
                // C'est un client/public : il ne voit que les trajets actifs et publics
                whereCondition.status = { [Op.in]: ['scheduled', 'ongoing'] };
            }
        }

        // 3. Filtre optionnel par statut (si passé en query params)
        if (status) {
            whereCondition.status = status;
        }

        // 4. RÉCUPÉRATION DES DONNÉES
        const routes = await Route.findAll({
            where: whereCondition,
            include: [
                {
                    model: Circuit,
                    as: 'circuit',
                    attributes: ['id', 'title', 'departureCity', 'destinationCity', 'agencyId'],
                    required: true, // INNER JOIN pour garantir que le circuit existe
                    include: [{ 
                        model: Agency, 
                        as: 'agency', 
                        attributes: ['id', 'name', 'status'],
                        where: agencyWhere // L'agence doit être active
                    }]
                },
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'firstName', 'lastName', 'phone']
                },
                {
                    model: AgencyVehicle,
                    as: 'vehicle',
                    attributes: ['id', 'name', 'capacity']
                }
            ],
            order: [
                ['dateStart', 'ASC'],
                ['hours', 'ASC']
            ]
        });

        return res.status(200).json({
            status: 'success',
            results: routes.length,
            data: routes
        });

    } catch (error) {
        console.error("❌ Erreur getRoutes:", error.message);
        return res.status(500).json({ 
            status: 'fail', 
            message: 'Erreur lors de la récupération des trajets.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined 
        });
    }
};


/**
 * [R] Récupérer les détails complets d'un trajet spécifique
 * Inclut le circuit, les POI associés et l'état d'avancement (Traces)
 */
exports.getRouteById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;

        // 1. Recherche de la route avec toutes ses dépendances
        const route = await Route.findOne({
            where: { id },
            include: [
                {
                    model: Circuit,
                    as: 'circuit',
                    include: [
                        { 
                            model: Agency, 
                            as: 'agency', 
                            attributes: ['id', 'name', 'description', 'total_booking', 'rating', 'status'] 
                        }
                    ]
                },
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'firstName', 'lastName', 'profileImage']
                },
                {
                    model: AgencyVehicle,
                    as: 'vehicle',
                    attributes: ['id', 'name', 'capacity', 'photo_url', 'description']
                },
                {
                    model: VisitedTrace,
                    as: 'traces',
                    include: [{
                        model: POI,
                        as: 'poi',
                        include: [
                            { model: POILocalization, as: 'frLocalization' },
                            { model: POILocalization, as: 'arLocalization' },
                            { model: POILocalization, as: 'enLocalization' },
                            { model: POIFile, as: 'files' }

                        ]
                    }],
                }
            ],
            // On trie les étapes (traces) par l'ordre défini lors de la création
            order: [[ { model: VisitedTrace, as: 'traces' }, 'order', 'ASC']]
        });

        // 2. Vérification d'existence
        if (!route) {
            return res.status(404).json({ 
                status: 'fail', 
                message: 'Trajet introuvable.' 
            });
        }

        // 3. SÉCURITÉ : Vérifier si l'utilisateur a le droit de voir ce trajet
        // Si l'agence est inactive, seul l'Admin peut encore voir les détails (pour archive)
        if (route.circuit.agency.status !== 'active' && userRole !== 'Admin') {
            return res.status(403).json({ 
                status: 'fail', 
                message: "Accès refusé. L'agence de ce trajet est actuellement inactive." 
            });
        }

        // 4. Calcul d'avancement simple (Optionnel)
        const totalSteps = route.traces.length;
        const visitedSteps = route.traces.filter(t => t.status === 'visited').length;
        const progressPercentage = totalSteps > 0 ? Math.round((visitedSteps / totalSteps) * 100) : 0;

        return res.status(200).json({
            status: 'success',
            data: {
                ...route.toJSON(),
                stats: {
                    totalSteps,
                    visitedSteps,
                    progressPercentage
                }
            }
        });

    } catch (error) {
        console.error("❌ Erreur getRouteById:", error.message);
        return res.status(500).json({ 
            status: 'fail', 
            message: 'Erreur lors de la récupération du trajet.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


/**
 * [U] Mettre à jour un trajet existant
 * - Vérifie la propriété (Owner/Staff)
 * - Vérifie si le nouveau véhicule appartient à la même agence
 */
exports.updateRoute = async (req, res) => {
    try {
        const { id } = req.params; // ID de la Route
        const { vehicleId, dateStart, hours, price, seats, status } = req.body;
        const userId = req.user.userId;
        const userRole = req.user.role;

        // 1. Trouver la route avec son agence pour vérification
        const route = await Route.findOne({
            where: { id },
            include: [{
                model: Circuit,
                as: 'circuit',
                attributes: ['agencyId']
            }]
        });

        if (!route) {
            return res.status(404).json({ status: 'fail', message: 'Trajet introuvable.' });
        }

        const targetAgencyId = route.circuit.agencyId;

        // 2. VÉRIFICATION DE SÉCURITÉ (Admin ou Staff autorisé de la même agence)
        if (userRole !== 'Admin') {
            // Vérification de l'appartenance à l'agence ET du rôle spécifique
            const userPermissions = await User.findOne({
                where: { id: userId },
                include: [
                    {
                        model: UserAgency,
                        as: 'memberships',
                        where: { agency_id: targetAgencyId },
                        required: true
                    },
                    {
                        model: UserActivity,
                        as: 'userActivities',
                        required: true,
                        include: [{
                            model: Activity,
                            as: 'activity',
                            where: {
                                name: { [Op.in]: ["AGENCY_OWNER", "AGENCY_DRIVER", "AGENCY_GUIDE"] }
                            }
                        }]
                    }
                ]
            });

            if (!userPermissions) {
                return res.status(403).json({ 
                    status: 'fail', 
                    message: "Accès refusé. Vous n'avez pas les droits requis (Owner/Driver/Guide) ou vous n'appartenez pas à cette agence." 
                });
            }
        }

        // 3. SI LE VÉHICULE EST CHANGÉ : Vérifier son appartenance
        if (vehicleId && vehicleId !== route.vehicleId) {
            const vehicle = await AgencyVehicle.findOne({
                where: { id: vehicleId, agency_id: targetAgencyId }
            });

            if (!vehicle) {
                return res.status(400).json({ 
                    status: 'fail', 
                    message: "Le nouveau véhicule sélectionné n'appartient pas à votre agence." 
                });
            }
        }

        // 4. MISE À JOUR
        await route.update({
            vehicleId: vehicleId || route.vehicleId,
            dateStart: dateStart || route.dateStart,
            hours: hours || route.hours,
            price: price || route.price,
            seats: seats || route.seats,
            status: status || route.status
        });

        return res.status(200).json({
            status: 'success',
            message: 'Trajet mis à jour avec succès.',
            data: route
        });

    } catch (error) {
        console.error("❌ Erreur updateRoute:", error.message);
        return res.status(500).json({ 
            status: 'fail', 
            message: 'Erreur serveur lors de la mise à jour du trajet.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * [D] Supprimer un trajet
 * - Vérifie si l'utilisateur est Admin ou un Staff autorisé de l'agence
 * - Supprime les étapes associées (VisitedTraces) avant la route
 */
exports.deleteRoute = async (req, res) => {
    const transaction = await Route.sequelize.transaction();
    
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;

        // 1. Trouver la route avec son agence
        const route = await Route.findOne({
            where: { id },
            include: [{
                model: Circuit,
                as: 'circuit',
                attributes: ['agencyId']
            }],
            transaction
        });

        if (!route) {
            await transaction.rollback();
            return res.status(404).json({ status: 'fail', message: 'Trajet introuvable.' });
        }

        const targetAgencyId = route.circuit.agencyId;

        // 2. VÉRIFICATION DE SÉCURITÉ (Admin ou Staff autorisé de la même agence)
        if (userRole !== 'Admin') {
            const userWithPermissions = await User.findOne({
                where: { id: userId },
                include: [
                    {
                        model: UserAgency,
                        as: 'memberships',
                        where: { agency_id: targetAgencyId },
                        required: true
                    },
                    {
                        model: UserActivity,
                        as: 'userActivities',
                        required: true,
                        include: [{
                            model: Activity,
                            as: 'activity',
                            where: {
                                name: { [Op.in]: ["AGENCY_OWNER", "AGENCY_DRIVER", "AGENCY_GUIDE"] }
                            }
                        }]
                    }
                ],
                transaction
            });

            if (!userWithPermissions) {
                await transaction.rollback();
                return res.status(403).json({ 
                    status: 'fail', 
                    message: "Accès refusé. Vous n'avez pas les droits pour supprimer ce trajet." 
                });
            }
        }

        // 3. SUPPRESSION DES ÉTAPES ASSOCIÉES (VisitedTraces)
        // Il est important de nettoyer les traces liées à cette route
        await VisitedTrace.destroy({
            where: { routeId: id },
            transaction
        });

        // 4. SUPPRESSION DE LA ROUTE
        await route.destroy({ transaction });

        await transaction.commit();

        return res.status(200).json({
            status: 'success',
            message: 'Trajet et ses étapes supprimés avec succès.'
        });

    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error("❌ Erreur deleteRoute:", error.message);
        return res.status(500).json({ 
            status: 'fail', 
            message: 'Erreur serveur lors de la suppression du trajet.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


exports.getRoutesByUser = async (req, res) => {
    try {
        const { userId } = req.params; 
        const authUserId = req.user.userId; 
        const authUserRole = req.user.role;

        let hasAccess = false;

        if (authUserRole === 'Admin' || authUserId === userId) {
            hasAccess = true; 
        } else {
            const requesterIsOwner = await User.findOne({
                where: { id: authUserId },
                include: [
                    {
                        model: UserAgency,
                        as: 'memberships',
                        required: true
                    },
                    {
                        model: UserActivity,
                        as: 'userActivities',
                        required: true,
                        include: [{
                            model: Activity,
                            as: 'activity',
                            where: { name: "AGENCY_OWNER" }
                        }]
                    }
                ]
            });

            if (requesterIsOwner) {
                const ownerAgenciesIds = requesterIsOwner.memberships.map(m => m.agency_id);
                
                const targetIsMember = await UserAgency.findOne({
                    where: { 
                        user_id: userId, 
                        agency_id: ownerAgenciesIds 
                    }
                });

                if (targetIsMember) hasAccess = true;
            }
        }

        if (!hasAccess) {
            return res.status(403).json({ 
                status: 'fail', 
                message: "Accès refusé. Vous n'avez pas la permission de voir le planning de cet utilisateur." 
            });
        }

        const routes = await Route.findAll({
            where: { userId },
            include: [
                {
                    model: Circuit,
                    as: 'circuit',
                    include: [{ model: Agency, as: 'agency', where: { status: 'active' } }]
                },
                {
                    model: AgencyVehicle,
                    as: 'vehicle',
                    attributes: ['id', 'name', 'capacity', 'photo_url']
                }
            ],
            order: [['dateStart', 'DESC'], ['hours', 'DESC']]
        });

        res.status(200).json({ 
            status: 'success', 
            results: routes.length, 
            data: routes 
        });

    } catch (error) {
        console.error("❌ Erreur getRoutesByUser:", error.message);
        res.status(500).json({ status: 'fail', message: "Erreur serveur lors de la récupération du planning." });
    }
};

exports.getRoutesByAgency = async (req, res) => {
    try {
        const { agencyId } = req.params;
        const userId = req.user ? req.user.userId : null; 
        const userRole = req.user ? req.user.role : 'Guest';

        let hasStaffAccess = false;

        if (userRole === 'Admin') {
            hasStaffAccess = true;
        } else if (userId) {
            const userWithPermissions = await User.findOne({
                where: { id: userId },
                include: [
                    {
                        model: UserAgency,
                        as: 'memberships',
                        where: { agency_id: agencyId },
                        required: true
                    },
                    {
                        model: UserActivity,
                        as: 'userActivities',
                        required: true,
                        include: [{
                            model: Activity,
                            as: 'activity',
                            where: {
                                name: { [Op.in]: ["AGENCY_OWNER", "AGENCY_DRIVER", "AGENCY_GUIDE"] }
                            }
                        }]
                    }
                ]
            });

            if (userWithPermissions) hasStaffAccess = true;
        }

        let routeWhere = {};
        let creatorAttributes = ['firstName', 'lastName']; 

        if (hasStaffAccess) {
            routeWhere = {}; 
            creatorAttributes = ['id', 'firstName', 'lastName', 'phone']; 
        } else {
            routeWhere = {
                status: { [Op.in]: ['scheduled', 'ongoing'] }
            };
        }

        const routes = await Route.findAll({
            where: routeWhere,
            include: [
                {
                    model: Circuit,
                    as: 'circuit',
                    where: { agencyId: agencyId },
                    required: true,
                    include: [{ 
                        model: Agency, 
                        as: 'agency', 
                        where: { status: 'active', is_deleted: false },
                        attributes: ['id', 'name', 'status']
                    }]
                },
                {
                    model: User,
                    as: 'creator',
                    attributes: creatorAttributes
                },
                {
                    model: AgencyVehicle,
                    as: 'vehicle',
                    attributes: ['id', 'name', 'capacity']
                }
            ],
            order: [['dateStart', 'ASC']]
        });

        res.status(200).json({ 
            status: 'success', 
            view_type: hasStaffAccess ? 'Internal/Staff' : 'Public/Tourist',
            results: routes.length,
            data: routes 
        });

    } catch (error) {
        console.error("❌ Erreur getRoutesByAgency:", error.message);
        res.status(500).json({ status: 'fail', message: "Erreur serveur" });
    }
};

exports.getRoutesByCircuit = async (req, res) => {
    try {
        const { circuitId } = req.params;
        const userId = req.user ? req.user.userId : null;
        const userRole = req.user ? req.user.role : 'Guest';

        let canSeeInternalData = false;

        if (userRole === 'Admin') {
            canSeeInternalData = true;
        } else if (userId) {
            const circuit = await Circuit.findByPk(circuitId);
            
            if (circuit) {
                const userWithPermissions = await User.findOne({
                    where: { id: userId },
                    include: [
                        {
                            model: UserAgency,
                            as: 'memberships',
                            where: { agency_id: circuit.agencyId },
                            required: true
                        },
                        {
                            model: UserActivity,
                            as: 'userActivities',
                            required: true,
                            include: [{
                                model: Activity,
                                as: 'activity',
                                where: {
                                    name: { [Op.in]: ["AGENCY_OWNER", "AGENCY_DRIVER", "AGENCY_GUIDE"] }
                                }
                            }]
                        }
                    ]
                });

                if (userWithPermissions) canSeeInternalData = true;
            }
        }

        let whereCondition = { circuitId };
        
        if (!canSeeInternalData) {
            whereCondition.status = { [Op.in]: ['scheduled', 'ongoing'] };
        }

        const routes = await Route.findAll({
            where: whereCondition,
            include: [
                { 
                    model: AgencyVehicle, 
                    as: 'vehicle', 
                    attributes: ['id', 'name', 'capacity', 'photo_url'] 
                },
                { 
                    model: User, 
                    as: 'creator', 
                    attributes: ['firstName', 'lastName', 'phone'] 
                },
                {
                    model: Circuit,
                    as: 'circuit',
                    include: [{
                        model: Agency,
                        as: 'agency',
                        where: { status: 'active', is_deleted: false },
                        attributes: ['id', 'name']
                    }]
                }
            ],
            order: [['dateStart', 'ASC']]
        });

        res.status(200).json({ 
            status: 'success', 
            view_type: canSeeInternalData ? 'Internal/Staff' : 'Public/Tourist',
            results: routes.length,
            data: routes 
        });

    } catch (error) {
        console.error("❌ Erreur getRoutesByCircuit:", error.message);
        res.status(500).json({ status: 'fail', message: "Erreur lors de la récupération des données." });
    }
};


exports.assignDriver = async (req, res) => {
    try {
        const { routeId, userId } = req.body; 
        const requestUserId = req.user.userId; 
        const requestUserRole = req.user.role;

        const route = await Route.findByPk(routeId, {
            include: [{ model: Circuit, as: 'circuit' }]
        });

        if (!route) return res.status(404).json({ status: 'fail', message: 'Trajet non trouvé' });

        const agencyId = route.circuit.agencyId;

        if (requestUserRole !== 'Admin') {
            const isOwner = await User.findOne({
                where: { id: requestUserId },
                include: [
                    {
                        model: UserAgency,
                        as: 'memberships',
                        where: { agency_id: agencyId },
                        required: true
                    },
                    {
                        model: UserActivity,
                        as: 'userActivities',
                        required: true,
                        include: [{
                            model: Activity,
                            as: 'activity',
                            where: { name: "AGENCY_OWNER" } 
                        }]
                    }
                ]
            });

            if (!isOwner) {
                return res.status(403).json({ 
                    status: 'fail', 
                    message: "Accès refusé. Seul le propriétaire de l'agence peut assigner des chauffeurs." 
                });
            }
        }

        const driverPermission = await User.findOne({
            where: { id: userId },
            include: [
                {
                    model: UserAgency,
                    as: 'memberships',
                    where: { agency_id: agencyId },
                    required: true
                },
                {
                    model: UserActivity,
                    as: 'userActivities',
                    required: true,
                    include: [{
                        model: Activity,
                        as: 'activity',
                        where: { name: { [Op.in]: ["AGENCY_DRIVER", "AGENCY_GUIDE"] } }
                    }]
                }
            ]
        });

        if (!driverPermission) {
            return res.status(400).json({ 
                status: 'fail', 
                message: "L'utilisateur sélectionné n'est pas un chauffeur/guide valide pour cette agence." 
            });
        }

        await route.update({ userId: userId });

        res.status(200).json({
            status: 'success',
            message: 'Chauffeur assigné avec succès.',
            data: route
        });

    } catch (error) {
        console.error("❌ Erreur assignDriver:", error.message);
        res.status(500).json({ status: 'fail', message: 'Erreur lors de l\'assignation.' });
    }
};


exports.updateRouteSettings = async (req, res) => {
    try {
        const { routeId } = req.params;
        const authUserId = req.user.userId;
        const authUserRole = req.user.role;

        const route = await Route.findByPk(routeId, {
            include: [{ model: Circuit, as: 'circuit' }]
        });

        if (!route) return res.status(404).json({ status: 'fail', message: 'Trajet non trouvé.' });

        if (authUserRole !== 'Admin') {
            const isOwner = await UserAgency.findOne({
                where: { 
                    user_id: authUserId, 
                    agency_id: route.circuit.agencyId 
                }
            });

            const hasActivity = await UserActivity.findOne({
                where: { user_id: authUserId },
                include: [{ model: Activity, as: 'activity', where: { name: 'AGENCY_OWNER' } }]
            });

            if (!isOwner || !hasActivity) {
                return res.status(403).json({ 
                    status: 'fail', 
                    message: "Accès refusé. Vous n'avez pas les droits requis pour modifier les paramètres de ce trajet."
                });
            }
        }

        await route.update(req.body); 

        res.status(200).json({ status: 'success', data: route });

    } catch (error) {
        res.status(500).json({ status: 'fail', message: error.message });
    }
};


const updateRouteStatusWithAuth = async (req, res, nextStatus, allowedCurrentStatuses) => {
    try {
        const { routeId } = req.params;
        const authUserId = req.user.userId;
        const authUserRole = req.user.role;

        const route = await Route.findByPk(routeId, {
            include: [{ model: Circuit, as: 'circuit' }]
        });

        if (!route) {
            return res.status(404).json({ status: 'fail', message: 'Trajet non trouvé' });
        }

        let isAuthorized = false;

        if (authUserRole === 'Admin') {
            isAuthorized = true;
        } else if (route.userId === authUserId) {
            isAuthorized = true;
        } else {

const userWithPermission = await User.findOne({
    where: { id: authUserId },
    include: [
        {
            model: UserAgency,
            as: 'memberships',
            where: { agency_id: route.circuit.agencyId },
            required: true 
        },
        {
            model: UserActivity,
            as: 'userActivities',
            required: true,
            include: [{
                model: Activity,
                as: 'activity',
                where: { name: 'AGENCY_OWNER' } 
            }]
        }
    ]
});

if (userWithPermission) isAuthorized = true;
        }

        if (!isAuthorized) {
            return res.status(403).json({ 
                status: 'fail', 
                message: "Vous n'avez pas la permission de contrôler l'état de cette route." 
            });
        }

        if (allowedCurrentStatuses && !allowedCurrentStatuses.includes(route.status)) {
            return res.status(400).json({ 
                status: 'fail', 
                message: `Action impossible : la route est actuellement ${route.status}` 
            });
        }

        await route.update({ status: nextStatus });

        res.status(200).json({
            status: 'success',
            message: `Le trajet est passé à l'état : ${nextStatus}`,
            data: { id: route.id, status: route.status }
        });

    } catch (error) {
        console.error("❌ Erreur status update:", error.message);
        res.status(500).json({ status: 'fail', message: "Erreur serveur lors du changement de statut" });
    }
};

exports.startRoute = (req, res) => updateRouteStatusWithAuth(req, res, 'ongoing', ['scheduled']);
exports.pauseRoute = (req, res) => updateRouteStatusWithAuth(req, res, 'paused', ['ongoing']);
exports.resumeRoute = (req, res) => updateRouteStatusWithAuth(req, res, 'ongoing', ['paused']);
exports.endRoute = (req, res) => updateRouteStatusWithAuth(req, res, 'completed', ['ongoing']);
exports.cancelRoute = (req, res) => updateRouteStatusWithAuth(req, res, 'cancelled', ['scheduled', 'paused', 'ongoing']);