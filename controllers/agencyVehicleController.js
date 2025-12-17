const { 
    Agency, 
    AgencyVehicle,
    User, 
    UserAgency, 
    Activity, 
    UserActivity, 
    AgencyFiles,
    Licence
} = require('../models'); 
const { sequelize } = require('../config/db'); 
const { Op } = require('sequelize');
const { deleteMultipleFiles } = require('../config/cloudinary');


const ADMIN_ROLE_NAME = 'Admin';
const AGENCY_OWNER_ACTIVITY_NAME = "AGENCY_OWNER"; 

exports.createAgencyVehicle = async (req, res) => {
    const { agencyId } = req.params; // L'ID de l'agence à laquelle ajouter le véhicule
    const { name, capacity, description } = req.body;
    const uploadedFiles = req.files; // Doit contenir le champ 'photo'
    const userId = req.user.userId;
    const userRole = req.user.role;

    const photoFile = uploadedFiles?.mainImage;
    if (!photoFile) {
        return res.status(400).json({ success: false, message: "La photo du véhicule est requise." });
    }
    
    // Début de la transaction
    const t = await sequelize.transaction();
    const uploadedPublicId = [];

    try {
        // 1. **Vérification de l'Autorisation (Admin ou Owner)**
        let isAuthorized = (userRole === ADMIN_ROLE_NAME);

        if (!isAuthorized) {
            const ownerActivity = await Activity.findOne({ where: { name: AGENCY_OWNER_ACTIVITY_NAME } });
            if (ownerActivity) {
                const isOwnerOfThisAgency = await UserAgency.findOne({
                    where: { user_id: userId, agency_id: agencyId },
                    include: [{ model: User, as: 'user', include: [{ model: UserActivity, as: 'userActivities', where: { activity_id: ownerActivity.id }, required: true }] }],
                    transaction: t
                });
                if (isOwnerOfThisAgency) {
                    isAuthorized = true;
                }
            }
        }

        if (!isAuthorized) {
            await t.rollback();
            return res.status(403).json({ 
                success: false, 
                message: "Vous n’avez pas l’autorisation (Admin/Owner) d’ajouter un véhicule à cette agence." 
            });
        }
        
        const fileData = Array.isArray(photoFile) ? photoFile[0] : photoFile;
        uploadedPublicId.push(fileData.filename); // Pour le nettoyage en cas d'échec BDD

        // 2. Création du véhicule dans la BDD
        const newVehicle = await AgencyVehicle.create({
            agency_id: agencyId,
            name,
            capacity: parseInt(capacity),
            description,
            photo_url: fileData.path || fileData.secure_url,
            cloudinary_id: fileData.filename,
        }, { transaction: t });

        // 3. Commit Transaction
        await t.commit();

        return res.status(201).json({ 
            success: true, 
            message: "Véhicule ajouté avec succès.", 
            vehicle: newVehicle 
        });

    } catch (error) {
        await t.rollback();
        console.error("Erreur lors de la création du véhicule :", error);

        // Nettoyage Cloudinary en cas d'échec BDD
        if (uploadedPublicId.length > 0) {
            deleteMultipleFiles(uploadedPublicId).catch(err => {
                console.error("Erreur lors du nettoyage Cloudinary:", err);
            });
        }

        return res.status(500).json({ 
            success: false, 
            message: "Erreur serveur lors de l'ajout du véhicule.", 
            error: error.message 
        });
    }
};

exports.getAgencyVehicles = async (req, res) => {

    const { agencyId } = req.params; 
    const { vehicleId, name, capacity } = req.query; 

    const userId = req.user?.userId;
    const userRole = req.user?.role;
    
    const filter = {}; 

    try {
        console.log(`[AUTH CHECK] User ID: ${userId}, Role: ${userRole}, Agency ID: ${agencyId}`);
        
        const ownerActivity = await Activity.findOne({ 
            where: { name: AGENCY_OWNER_ACTIVITY_NAME } 
        });

        const agency = await Agency.findOne({
            where: { id: agencyId, is_deleted: false },
            attributes: { exclude: ['licence_id', 'is_deleted'] },
            include: [
                {
                    model: AgencyFiles,
                    as: 'files',
                    attributes: ['id', 'url', 'type', 'is_principale', 'createdAt']
                },
                {
                    model: UserAgency,
                    as: 'userAgencies',
                    include: [
                        {
                            model: User,
                            as: 'user',
                            attributes: ['id', 'gmail', 'first_name', 'last_name', 'profile_image'],
                            include: [
                                {
                                    model: Activity,
                                    as: 'activities',
                                    through: { attributes: [] },
                                    attributes: ['name']
                                }
                            ]
                        }
                    ]
                }
            ]
        });
        
        if (!agency) {
            return res.status(404).json({ 
                success: false, 
                message: "L'agence demandée est introuvable."
            });
        }
        
        console.log(`[AGENCY STATUS] Agency: ${agency.id}, Status: ${agency.status}`);

        let isAuthorized = true;
        
        if (agency.status !== 'active') {
            
            isAuthorized = (userRole === ADMIN_ROLE_NAME);

            if (!isAuthorized && userId) {
                
                if (ownerActivity) {
                    const isOwnerOfThisAgency = await UserAgency.findOne({
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
                    
                    if (isOwnerOfThisAgency) {
                        isAuthorized = true;
                        console.log(`[AUTH CHECK] User ${userId} is confirmed as Owner.`);
                    } else {
                        console.log(`[AUTH CHECK] User ${userId} is NOT confirmed as Owner for agency ${agencyId}.`);
                    }
                }
            }
        }
        
        if (!isAuthorized) {
            console.log(`[AUTH CHECK] Access denied for User ${userId}.`);
            return res.status(403).json({ 
                success: false, 
                message: "L'agence n'est pas encore active. Accès limité aux administrateurs et au propriétaire de l'agence." 
            });
        }

        if (name) {
            filter.name = {
                [Op.like]: `%${name}%` 
             };
        }
        if (capacity) {
            const parsedCapacity = parseInt(capacity);
            if (!isNaN(parsedCapacity)) {
                 filter.capacity = { [Op.gte]: parsedCapacity }; 
            }
        }
        
        const whereClause = {
            agency_id: agencyId, 
            ...filter
        };
        
        if (vehicleId) {
            whereClause.id = vehicleId;
        }

        const vehicles = await AgencyVehicle.findAll({
            where: whereClause,
        });

        const agencyData = agency.get({ plain: true });
        

        if (vehicles.length === 0) {
            if (vehicleId) {
                 return res.status(404).json({ 
                    success: false, 
                    message: "Véhicule introuvable pour cette agence.",
                    agency: agencyData
                });
            }
            return res.status(200).json({ 
                success: true, 
                message: "Aucun véhicule trouvé pour cette agence.",
                vehicles: [],
                agency: agencyData
            });
        }
        
        if (vehicleId) {
             return res.status(200).json({ 
                success: true, 
                vehicle: vehicles[0] ,
                agency: agencyData
            });
        }

        return res.status(200).json({
            success: true,
            message: ` ${vehicles.length} véhicule(s) trouvé(s) pour cette agence.`,
            vehicles: vehicles,
            agency: agencyData
        });

    } catch (error) {
        console.error("Erreur lors de la récupération du véhicule de l'agence :", error);
        return res.status(500).json({
            success: false,
            message: "Erreur interne du serveur.",
            error: error.message
        });
    }
};

exports.updateAgencyVehicle = async (req, res) => {
    const { vehicleId } = req.params;
    const updateData = req.body;
    const uploadedFiles = req.files;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const t = await sequelize.transaction();
    const publicIdsToCleanUp = [];
    const uploadedPublicId = [];
    let oldCloudinaryId = null;

    try {
        const vehicle = await AgencyVehicle.findByPk(vehicleId, { transaction: t });
        if (!vehicle) {
            await t.rollback();
            return res.status(404).json({ success: false, message: "Véhicule non trouvé." });
        }

        const agencyId = vehicle.agency_id;

        // 1. **Vérification de l'Autorisation (Admin ou Owner de l'agence)**
        let isAuthorized = (userRole === ADMIN_ROLE_NAME);

        if (!isAuthorized) {
            // Logique de vérification de l'Owner (réutilisée de updateAgency)
            const ownerActivity = await Activity.findOne({ where: { name: AGENCY_OWNER_ACTIVITY_NAME } });
            if (ownerActivity) {
                const isOwnerOfThisAgency = await UserAgency.findOne({
                    where: { user_id: userId, agency_id: agencyId },
                    include: [{ model: User, as: 'user', include: [{ model: UserActivity, as: 'userActivities', where: { activity_id: ownerActivity.id }, required: true }] }],
                    transaction: t
                });
                if (isOwnerOfThisAgency) {
                    isAuthorized = true;
                }
            }
        }

        if (!isAuthorized) {
            await t.rollback();
            return res.status(403).json({ 
                success: false, 
                message: "Vous n’avez pas l’autorisation de modifier ce véhicule." 
            });
        }
        
        const vehicleUpdateData = { ...updateData };

        // 2. Gestion de la nouvelle photo
        const photoFile = uploadedFiles?.mainImage;
        if (photoFile) {
            const fileData = Array.isArray(photoFile) ? photoFile[0] : photoFile;
            
            // Stocker l'ancien ID pour nettoyage
            oldCloudinaryId = vehicle.cloudinary_id; 
            
            // Mettre à jour les données du véhicule
            vehicleUpdateData.photo_url = fileData.path || fileData.secure_url;
            vehicleUpdateData.cloudinary_id = fileData.filename;
            
            uploadedPublicId.push(fileData.filename);
        }
        
        // Assurez-vous que la capacité est un nombre si elle est fournie
        if (vehicleUpdateData.capacity) {
            vehicleUpdateData.capacity = parseInt(vehicleUpdateData.capacity);
        }

        // 3. Mise à jour dans la BDD
        const [updatedRows] = await AgencyVehicle.update(vehicleUpdateData, {
            where: { id: vehicleId, agency_id: agencyId },
            transaction: t
        });
        
        if (updatedRows === 0 && !photoFile) {
            await t.rollback();
            return res.status(400).json({ success: false, message: "Aucun champ à mettre à jour." });
        }

        // 4. Commit et Nettoyage
        await t.commit();
        
        // Nettoyage de l'ancienne image après succès BDD (Non-blocking)
        if (oldCloudinaryId) {
            deleteMultipleFiles([oldCloudinaryId]).catch(err => {
                console.error("Erreur lors du nettoyage Cloudinary après succès BDD:", err);
            });
        }

        const updatedVehicle = await AgencyVehicle.findByPk(vehicleId);

        return res.status(200).json({ 
            success: true, 
            message: "Véhicule mis à jour avec succès.", 
            vehicle: updatedVehicle 
        });

    } catch (error) {
        await t.rollback();

        // Nettoyage des fichiers nouvellement uploadés en cas d'échec BDD
        if (uploadedPublicId.length > 0) {
            deleteMultipleFiles(uploadedPublicId).catch(err => {
                console.error("Erreur lors du nettoyage Cloudinary après échec BDD:", err);
            });
        }

        console.error("Erreur lors de la mise à jour du véhicule :", error);
        return res.status(500).json({ success: false, message: "Erreur serveur.", error: error.message });
    }
};

exports.deleteAgencyVehicle = async (req, res) => {
    const { vehicleId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    const t = await sequelize.transaction();
    let publicIdToClean = null;

    try {
        const vehicle = await AgencyVehicle.findByPk(vehicleId, { 
            attributes: ['agency_id', 'cloudinary_id'],
            transaction: t 
        });

        if (!vehicle) {
            await t.rollback();
            return res.status(404).json({ success: false, message: "Véhicule non trouvé." });
        }
        
        const agencyId = vehicle.agency_id;
        
        // 1. **Vérification de l'Autorisation (Admin ou Owner de l'agence)**
        let isAuthorized = (userRole === ADMIN_ROLE_NAME);

        if (!isAuthorized) {
            const ownerActivity = await Activity.findOne({ where: { name: AGENCY_OWNER_ACTIVITY_NAME } });
            if (ownerActivity) {
                const isOwnerOfThisAgency = await UserAgency.findOne({
                    where: { user_id: userId, agency_id: agencyId },
                    include: [{ model: User, as: 'user', include: [{ model: UserActivity, as: 'userActivities', where: { activity_id: ownerActivity.id }, required: true }] }],
                    transaction: t
                });
                if (isOwnerOfThisAgency) {
                    isAuthorized = true;
                }
            }
        }
        
        if (!isAuthorized) {
            await t.rollback();
            return res.status(403).json({ 
                success: false, 
                message: "Vous n’avez pas l’autorisation de supprimer ce véhicule." 
            });
        }

        // 2. Suppression dans la BDD
        const deletedRows = await AgencyVehicle.destroy({
            where: { id: vehicleId, agency_id: agencyId },
            transaction: t
        });

        if (deletedRows === 0) {
            await t.rollback();
            return res.status(400).json({ success: false, message: "La suppression n'a pas été effectuée." });
        }
        
        // 3. Préparation du nettoyage
        publicIdToClean = vehicle.cloudinaryId;

        // 4. Commit et Nettoyage
        await t.commit();

        if (publicIdToClean) {
             deleteMultipleFiles([publicIdToClean]).catch(err => {
                console.error("Erreur lors du nettoyage Cloudinary après succès BDD:", err);
            });
        }
        
        return res.status(200).json({ 
            success: true, 
            message: "Véhicule supprimé avec succès." 
        });

    } catch (error) {
        await t.rollback();
        console.error("Erreur lors de la suppression du véhicule :", error);
        return res.status(500).json({ success: false, message: "Erreur serveur lors de la suppression.", error: error.message });
    }
};