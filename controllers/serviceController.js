const { 
    Agency, 
    User, 
    UserAgency, 
    Activity, 
    UserActivity, 
    AgencyFiles,
    Licence,
    Service,
    AgencyService
} = require('../models'); 
const { sequelize } = require('../config/db'); 


const ADMIN_ROLE = 'Admin'; 
const AGENCY_OWNER_ACTIVITY_NAME = 'AGENCY_OWNER';

const isUserOwnerOfAgency = async (userId, agencyId) => {
    try {
        if (!userId || !agencyId) return false;
        
        const ownerActivity = await Activity.findOne({ 
            where: { 
                name: AGENCY_OWNER_ACTIVITY_NAME 
            } 
        });
        if (!ownerActivity) return false;

        const isOwner = await UserAgency.findOne({
            where: { user_id: userId, agency_id: agencyId }, 
            include: [{ 
                model: User, 
                as: 'user', 
                include: [{ 
                    model: UserActivity, 
                    as: 'userActivities', 
                    where: { activity_id: ownerActivity.id }, 
                    required: true 
                }] 
            }],
        });
        return !!isOwner;
    } catch (e) {
        console.error("Erreur lors de la vérification de la propriété de l'agence:", e);
        return false;
    }
};


// 1.(Admin Management: CRUD sur Service)
exports.createService = async (req, res) => {

    if (req.user?.role !== ADMIN_ROLE) {
        return res.status(403).json({ 
            success: false,
            message: "Accès refusé. Seul un administrateur peut créer des services généraux." 
        });
    }
    
    const { title, description } = req.body;

    if (!title) {
        return res.status(400).json({ 
            success: false,
            message: "Le titre du service est requis." 
        });
    }

    try {
        const newService = await Service.create(
            { 
                title,
                description 
            });

        return res.status(201).json({
            success: true,
            message: "Service créé avec succès.",
            service: newService
        });
    } catch (error) {
        console.error("Erreur lors de la création du service:", error);
        return res.status(500).json({ 
            success: false,
            message: "Erreur interne du serveur." 
        });
    }
};


exports.getAllServices = async (req, res) => {
    try {
        const services = await Service.findAll({
            attributes: ['id', 'title', 'description', 'createdAt']
        });

        return res.status(200).json({
            success: true,
            count: services.length,
            services: services
        });
    } catch (error) {
        console.error("Erreur lors de la récupération des services:", error);
        return res.status(500).json({ 
            success: false,
            message: "Erreur interne du serveur." 
        });
    }
};

exports.getServiceById = async (req, res) => {
    const { serviceId } = req.params;
    
    try {
        const service = await Service.findByPk(serviceId, {
            attributes: ['id', 'title', 'description', 'createdAt']
        });

        if (!service) {
            return res.status(404).json({ 
                success: false,
                message: "Service introuvable." 
            });
        }

        return res.status(200).json({ 
            success: true,
            service 
        });
    } catch (error) {
        console.error("Erreur lors de la récupération du service par ID:", error);
        return res.status(500).json({ 
            success: false,
            message: "Erreur interne du serveur." 
        });
    }
};


exports.updateService = async (req, res) => {
    if (req.user?.role !== ADMIN_ROLE) {
        return res.status(403).json({ 
            success: false,
            message: "Accès refusé. Seul un administrateur peut modifier les services généraux." 
        });
    }
    
    const { serviceId } = req.params;
    const { title, description } = req.body;

    try {
        const [updatedRows] = await Service.update({ 
            title,
            description 
        }, {
            where: { id: serviceId }
        });

        if (updatedRows === 0) {
            return res.status(404).json({ 
                success: false,
                message: "Service introuvable." 
            });
        }

        const updatedService = await Service.findByPk(serviceId);

        return res.status(200).json({ 
            success: true, 
            message: "Service mis à jour avec succès.", 
            service: updatedService 
        });
    } catch (error) {
        console.error("Erreur lors de la mise à jour du service:", error);
        return res.status(500).json({ 
            success: false,
            message: "Erreur interne du serveur." 
        });
    }
};


exports.deleteService = async (req, res) => {
    if (req.user?.role !== ADMIN_ROLE) {
        return res.status(403).json({ 
            success: false,
            message: "Accès refusé. Seul un administrateur peut supprimer des services généraux." 
        });
    }
    
    const { serviceId } = req.params;

    try {
        const isUsed = await AgencyService.findOne({ 
            where: { serviceId } 
        });
        if (isUsed) {
            return res.status(409).json({
                 success: false,
                 message: "Ce service est utilisé par une ou plusieurs agences et ne peut pas être supprimé." 
                });
        }
        
        const deletedRows = await Service.destroy({
            where: { id: serviceId }
        });

        if (deletedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Service introuvable." 
            });
        }

        return res.status(200).json({ 
            success: true,
            message: "Service supprimé avec succès." 
        });
    } catch (error) {
        console.error("Erreur lors de la suppression du service:", error);
        return res.status(500).json({
            success: false,
            message: "Erreur interne du serveur." 
        });
    }
};


// 2.(Agency-Service Management: Owner/Staff)
exports.addServiceToAgency = async (req, res) => {

    const { agencyId } = req.params;
    const { serviceId, price } = req.body;
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    
    const isAuthorized = userRole === ADMIN_ROLE || (await isUserOwnerOfAgency(userId, agencyId));
    if (!userId || !isAuthorized) {
        return res.status(403).json({ 
            success: false,
            message: "Accès refusé. Seul le propriétaire ou un administrateur peut ajouter des services à cette agence." 
        });
    }

    if (!serviceId || price === undefined) {
        return res.status(400).json({ 
            success: false,
            message: "L'ID du service et le prix sont requis." 
        });
    }

    try {
        const [agency, service] = await Promise.all([
            Agency.findOne({ where: { id: agencyId, is_deleted: false } }),
            Service.findByPk(serviceId)
        ]);
        
        if (!agency) {
            return res.status(404).json({ 
                success: false,
                message: "Agence introuvable (ou supprimée)." 
            });
        }
        if (!service) {
            return res.status(404).json({ 
                success: false,
                message: "Service général introuvable." 
            });
        }

        const existingAgencyService = await AgencyService.findOne({ 
            where: { agencyId, serviceId } 
        });

        if (existingAgencyService) {
             return res.status(409).json({ 
                success: false,
                message: "Ce service est déjà associé à l'agence." 
            });
        }

        const agencyService = await AgencyService.create({
            agencyId,
            serviceId,
            price: parseFloat(price)
        });

        return res.status(201).json({ 
            success: true, 
            message: "Service ajouté à l'agence avec succès.", 
            agencyService 
        });

    } catch (error) {
        console.error("Erreur lors de l'ajout du service à l'agence:", error);
        return res.status(500).json({ 
            success: false,
            message: "Erreur interne du serveur." 
        });
    }
};


exports.getAgencyServices = async (req, res) => {

    const { agencyId } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    
    try {
        const agency = await Agency.findOne({ 
             where: { id: agencyId, is_deleted: false },
             attributes: ['id', 'status'] 
        });

        if (!agency) {
            return res.status(404).json({ 
                success: false,
                message: "Agence introuvable (ou supprimée)." 
            });
        }
        
        let isAuthorized = true;
        
        if (agency.status !== 'active') {
            
            isAuthorized = (userRole === ADMIN_ROLE); 

            if (!isAuthorized && userId) {
                if (await isUserOwnerOfAgency(userId, agencyId)) {
                    isAuthorized = true;
                }
            }
        }
        
        if (!isAuthorized) {
            return res.status(403).json({ 
                success: false, 
                message: "L'agence n'est pas encore active. L'accès aux services est limité aux administrateurs et au propriétaire de l'agence." 
            });
        }

        const services = await AgencyService.findAll({
            where: { agencyId },
            include: [{ 
                model: Service, 
                as: 'service',
                attributes: ['id', 'title', 'description']
            }],
            attributes: ['id', 'price', 'createdAt']
        });

        if (services.length === 0) {
             return res.status(200).json({ 
                 success: true, 
                 message: "Aucun service trouvé pour cette agence.",
                 count: 0,
                 services: []
            });
        }

        return res.status(200).json({ 
            success: true, 
            count: services.length,
            services: services
        });

    } catch (error) {
        console.error("Erreur lors de la récupération des services de l'agence:", error);
        return res.status(500).json({ 
            success: false,
            message: "Erreur interne du serveur." 
        });
    }
};


exports.updateAgencyServicePrice = async (req, res) => {
    const { agencyId, serviceId } = req.params;
    const { price } = req.body;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    const agency = await Agency.findOne({ 
        where: { id: agencyId, is_deleted: false },
        attributes: ['id'] 
    });
    if (!agency) {
        return res.status(404).json({ 
            success: false,
            message: "Agence introuvable (ou supprimée)." 
        });
    }
    const isAuthorized = userRole === ADMIN_ROLE || (await isUserOwnerOfAgency(userId, agencyId));
    if (!userId || !isAuthorized) {
        return res.status(403).json({ 
            success: false,
            message: "Accès refusé. Seul le propriétaire ou un administrateur peut modifier les prix des services de cette agence." 
        });
    }

    if (price === undefined) {
        return res.status(400).json({ 
            success: false,
            message: "Le nouveau prix est requis." 
        });
    }
    
    try {
        const [updatedRows] = await AgencyService.update(
            { price: parseFloat(price) },
            { where: { agencyId, serviceId } }
        );

        if (updatedRows === 0) {
            return res.status(404).json({ 
                success: false,
                message: "Service non trouvé pour cette agence." 
            });
        }
        
        const updatedService = await AgencyService.findOne({
            where: { agencyId, serviceId },
            include: [{ model: Service, as: 'service' }]
        });

        return res.status(200).json({ 
            success: true, 
            message: "Prix du service mis à jour avec succès.",
            agencyService: updatedService
        });

    } catch (error) {
        console.error("Erreur lors de la mise à jour du prix du service:", error);
        return res.status(500).json({ 
            success: false,
            message: "Erreur interne du serveur." 
        });
    }
};


exports.removeServiceFromAgency = async (req, res) => {
    const { agencyId, serviceId } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    
    const agency = await Agency.findOne({ 
        where: { id: agencyId, is_deleted: false },
        attributes: ['id'] 
    });
    if (!agency) {
        return res.status(404).json({ 
            success: false,
            message: "Agence introuvable (ou supprimée)." 
        });
    }
    const isAuthorized = userRole === ADMIN_ROLE || (await isUserOwnerOfAgency(userId, agencyId));
    if (!userId || !isAuthorized) {
        return res.status(403).json({ 
            success: false,
            message: "Accès refusé. Seul le propriétaire ou un administrateur peut retirer des services de cette agence." 
        });
    }

    try {
        const deletedRows = await AgencyService.destroy({
            where: { agencyId, serviceId }
        });

        if (deletedRows === 0) {
            return res.status(404).json({ 
                success: false,
                message: "Service non trouvé ou déjà supprimé pour cette agence." 
            });
        }

        return res.status(200).json({ 
            success: true, 
            message: "Service retiré de l'agence avec succès." 
        });

    } catch (error) {
        console.error("Erreur lors de la suppression du service de l'agence:", error);
        return res.status(500).json({ 
            success: false,
            message: "Erreur interne du serveur." 
        });
    }
};