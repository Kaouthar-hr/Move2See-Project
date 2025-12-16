const { Route, Circuit, AgencyVehicle, VisitedTrace, POI, UserActivity, Activity, UserAgency, Agency, User } = require("../models");
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