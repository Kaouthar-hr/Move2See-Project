const { 
    Agency, 
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
const VALID_AGENCY_MEMBER_ROLES = ['AGENCY_DRIVER', 'AGENCY_GUIDE'];
const AGENCY_STATUS_PENDING = 'pending';

exports.createAgency = async (req, res) => {
    const userId = req.user?.userId || req.user?.id; 
    const { name, description, licenceType } = req.body;
    const uploadedFiles = req.files;
    const documentFile = uploadedFiles?.document;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: "Utilisateur non authentifié." 
        });
    }

    const t = await sequelize.transaction();
    let uploadedPublicIds = [];

    try {
        if (!documentFile || (Array.isArray(documentFile) && documentFile.length === 0)) {
            await t.rollback();
            return res.status(400).json({ 
                success: false, 
                message:"Le document de licence doit être fourni pour créer une agence."
            });
        }

        const fileData = Array.isArray(documentFile) ? documentFile[0] : documentFile;
        uploadedPublicIds.push(fileData.filename);

        // Création de la licence
        const newLicence = await Licence.create({
            file_url: fileData.path || fileData.secure_url,
            cloudinary_id: fileData.filename,
            type: licenceType,
            status: AGENCY_STATUS_PENDING, 
        }, { transaction: t });

        // Création de l'agence
        const newAgency = await Agency.create({
            name,
            description,
            licence_id: newLicence.id, 
            status: AGENCY_STATUS_PENDING, 
            is_deleted: false,
        }, { transaction: t });

        // Association de l'utilisateur à l'agence
        await UserAgency.create({
            user_id: userId,
            agency_id: newAgency.id,
        }, { transaction: t });

        // Vérifier ou créer l’activité AGENCY_OWNER
        let ownerActivity = await Activity.findOne({ 
            where: { name: AGENCY_OWNER_ACTIVITY_NAME } 
        });

        if (!ownerActivity) {
            ownerActivity = await Activity.create({ 
                name: AGENCY_OWNER_ACTIVITY_NAME,
                description: "Propriétaire d'agence"
            }, { transaction: t });
        }

        // Association de l'utilisateur avec l’activité AGENCY_OWNER
        await UserActivity.create({
            user_id: userId,
            activity_id: ownerActivity.id,
        }, { transaction: t });

        // Préparation des fichiers supplémentaires
        const filesToCreate = [];

        const extractFileData = (file, type) => {
            if (!file) return null;
            const f = Array.isArray(file) ? file[0] : file;
            if (type !== 'DOCUMENT') uploadedPublicIds.push(f.filename);
            return {
                agency_id: newAgency.id,
                url: f.path || f.secure_url,
                public_id: f.filename,
                type: type,
                is_principale: (type === 'MAIN_IMAGE' || type === 'MAIN_VIDEO'),
            };
        };

        const addFileIfExist = (files, type, isMulti = false) => {
            if (isMulti && Array.isArray(files)) {
                files.forEach(f => {
                    const data = extractFileData(f, type);
                    if (data) filesToCreate.push(data);
                });
            } else if (files && type !== 'DOCUMENT') {
                const data = extractFileData(files, type);
                if (data) filesToCreate.push(data);
            }
        };

        // Ajout du document licence
        filesToCreate.push({
            agency_id: newAgency.id,
            url: newLicence.file_url,
            public_id: newLicence.cloudinary_id,
            type: 'DOCUMENT',
            is_principale: false,
        });

        // Ajout des autres fichiers
        addFileIfExist(uploadedFiles.mainImage, 'MAIN_IMAGE');
        addFileIfExist(uploadedFiles.mainVideo, 'MAIN_VIDEO');
        addFileIfExist(uploadedFiles.audio, 'AUDIO');
        addFileIfExist(uploadedFiles.virtualTour, 'VIRTUAL_TOUR');
        addFileIfExist(uploadedFiles.galleryImages, 'IMAGE', true);
        addFileIfExist(uploadedFiles.galleryVideos, 'VIDEO', true);

        if (filesToCreate.length > 0) {
            await AgencyFiles.bulkCreate(filesToCreate, { transaction: t });
        }

        await t.commit();

        const finalAgency = await Agency.findByPk(newAgency.id, {
            include: [
                { model: AgencyFiles, as: 'files' },
                { model: Licence, as: 'licence' } 
            ]
        });

        return res.status(201).json({
            success: true,
            message: "L’agence a été créée avec succès et elle est en attente de validation par l’administrateur.",
            agency: finalAgency
        });

    } catch (error) {
        await t.rollback();
        console.error("Erreur lors de la création de l'agence :", error);

        if (uploadedPublicIds.length > 0) {
            deleteMultipleFiles(uploadedPublicIds).catch(err => {
                console.error("Erreur lors du nettoyage Cloudinary:", err);
            });
        }

        return res.status(500).json({
            success: false,
            message: "Une erreur s’est produite lors du traitement de la requête.",
            error: error.message
        });
    }
};

exports.getAgency = async (req, res) => {
    const agency_id = req.params.agencyId;
    const userId = req.user ? req.user.userId : null;
    let isAdmin = false;

    try {
        // 1️⃣ Vérifier si l'utilisateur est Admin
        if (userId) {
            const user = await User.findByPk(userId, { attributes: ['role'] });
            if (user && user.role === ADMIN_ROLE_NAME) {
                isAdmin = true;
            }
        }

        // 2️⃣ Récupération de l'agence avec ses fichiers, membres et licence
        const agency = await Agency.findOne({
            where: { id: agency_id, is_deleted: false },
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
                },
                {
                    model: Licence,
                    as: 'licence',
                    attributes: ['id', 'file_url', 'type', 'status']
                }
            ]
        });

        if (!agency) {
            return res.status(404).json({
                success: false,
                message: "L'agence n'existe pas."
            });
        }

        // 3️⃣ Préparer la réponse en format JSON
        const responseAgency = agency.toJSON();

        // Formater les membres pour inclure les rôles
        responseAgency.userAgencies = responseAgency.userAgencies.map(memberLink => {
            const member = memberLink.user;
            return {
                id: member.id,
                gmail: member.gmail,
                firstName: member.first_name,
                lastName: member.last_name,
                profileImage: member.profile_image,
                roles: member.activities.map(a => a.name)
            };
        });

        // 4️⃣ Contrôle d'accès

        // ✅ Si agence active ou utilisateur Admin
        if (agency.status === 'active' || isAdmin) {
            return res.status(200).json({ success: true, agency: responseAgency });
        }

        // ✅ Vérifier si l'utilisateur est propriétaire de l'agence
        if (userId) {
            const ownerCheck = await UserActivity.findOne({
                where: { user_id: userId },
                include: [
                    {
                        model: Activity,
                        as: 'activity',
                        where: { name: AGENCY_OWNER_ACTIVITY_NAME }
                    },
                    {
                        model: User,
                        as: 'user',
                        include: [
                            {
                                model: UserAgency,
                                as: 'memberships',
                                where: { agency_id }
                            }
                        ]
                    }
                ]
            });

            if (ownerCheck) {
                return res.status(200).json({ success: true, agency: responseAgency });
            }
        }

        // ❌ Sinon accès interdit
        return res.status(403).json({
            success: false,
            message: "Vous n'êtes pas autorisé à accéder à cette agence."
        });

    } catch (error) {
        console.error("Erreur lors de la récupération de l'agence:", error);
        return res.status(500).json({
            success: false,
            message: "Erreur serveur lors de la récupération de l'agence.",
            error: error.message
        });
    }
};


exports.getAgencies = async (req, res) => {
    const { 
        limit = 10, 
        offset = 0, 
        search, 
        licenceType, 
        sortBy = 'createdAt', 
        sortOrder = 'DESC' 
    } = req.query;

    const userId = req.user ? req.user.userId : null;
    let isAdmin = false;
    
    const agencyWhere = {}; 
    
    try {

        if (userId) {
            const user = await User.findByPk(userId, { attributes: ['role'] });
            if (user && user.role === ADMIN_ROLE_NAME) {
                isAdmin = true;
            }
        }
        
        if (!isAdmin) {
            agencyWhere.status = 'active';
        }
        
        if (search) {
            agencyWhere.name = { [Op.like]: `%${search}%` };
        }
        
        const licenceInclude = {
            model: Licence,
            as: 'licence',
            attributes: ['id', 'type', 'status', 'file_url'],
            required: false 
        };
        
        if (licenceType) {
            licenceInclude.where = { type: licenceType };
            licenceInclude.required = true; 
        }
        
        const result = await Agency.findAndCountAll({
            where: agencyWhere,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [[sortBy, sortOrder]],
            
            include: [
                licenceInclude,
                {
                    model: AgencyFiles,
                    as: 'files',
                    where: { type: 'MAIN_IMAGE', is_principale: true },
                    attributes: ['url'],
                    required: false, 
                    limit: 1 
                }
            ],
            attributes: { exclude: ['isDeleted', 'licence_id'] }
        });

        const agencies = result.rows.map(agency => ({
            ...agency.toJSON(),
            mainImage: agency.files.length > 0 ? agency.files[0].url : null,
            files: undefined 
        }));
        
        return res.status(200).json({
            success: true,
            total: result.count,
            limit: parseInt(limit),
            offset: parseInt(offset),
            agencies: agencies
        });

    } catch (error) {
        console.error("Erreur lors de la récupération des agences:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Une erreur s’est produite lors de la récupération de la liste des agences.", 
            error: error.message 
        });
    }
};

exports.addMemberToAgency = async (req, res) => {
    const { agencyId } = req.params;
    const { memberEmail, roleName } = req.body;
    const inviterUserId = req.user.userId;
    const inviterRole = req.user.role;

    if (!VALID_AGENCY_MEMBER_ROLES.includes(roleName)) {
        return res.status(400).json({
            success: false,
            message: `Rôle invalide. Rôles disponibles : ${VALID_AGENCY_MEMBER_ROLES.join(', ')}`
        });
    }

    const t = await sequelize.transaction();

    try {
        // 1️⃣ Vérifier si l'agence existe
        const agency = await Agency.findByPk(agencyId, { transaction: t });
        if (!agency) {
            await t.rollback();
            return res.status(404).json({ success: false, message: "L'agence n'existe pas." });
        }

        // 2️⃣ Vérifier si le membre existe
        const member = await User.findOne({
            where: { gmail: memberEmail },
            attributes: ['id', 'gmail', 'firstName', 'lastName', 'profileImage'],
            transaction: t
        });
        if (!member) {
            await t.rollback();
            return res.status(404).json({ success: false, message: "L'utilisateur n'existe pas." });
        }

        // 3️⃣ Vérifier l'autorisation de l'inviteur
        let isAuthorized = inviterRole === ADMIN_ROLE_NAME;

        if (!isAuthorized) {
            const ownerActivity = await Activity.findOne({
                where: { name: AGENCY_OWNER_ACTIVITY_NAME },
                transaction: t
            });
            if (!ownerActivity) {
                await t.rollback();
                return res.status(500).json({
                    success: false,
                    message: "Le rôle de propriétaire (AgencyOwner) n’est pas défini dans le système."
                });
            }

            const inviterLink = await UserAgency.findOne({
                where: { user_id: inviterUserId,agency_id: agencyId },
                include: [
                    {
                        model: User,
                        as: 'user',
                        include: [
                            {
                                model: UserActivity,
                                as: 'userActivities',
                                where: { activity_id: ownerActivity.id },
                                required: true
                            }
                        ]
                    }
                ],
                transaction: t
            });

            if (inviterLink) isAuthorized = true;
        }

        if (!isAuthorized) {
            await t.rollback();
            return res.status(403).json({
                success: false,
                message: "Vous n’avez pas l’autorisation 'Admin' ou 'AgencyOwner' pour gérer les membres de cette agence."
            });
        }

        // 4️⃣ Vérifier si le membre est déjà dans l'agence
        const existingLink = await UserAgency.findOne({
            where: { user_id: member.id, agency_id:agencyId },
            transaction: t
        });
        if (existingLink) {
            await t.rollback();
            return res.status(400).json({ success: false, message: "L'utilisateur est déjà membre de cette agence." });
        }

        // 5️⃣ Ajouter le membre à l'agence
        await UserAgency.create({ user_id: member.id, agency_id:agencyId }, { transaction: t });

        // 6️⃣ Ajouter l'activité correspondante au rôle
        const activityRole = await Activity.findOne({
            where: { name: roleName },
            transaction: t
        });

        if (activityRole) {
            const existingUserActivity = await UserActivity.findOne({
                where: { user_id: member.id, activity_id: activityRole.id },
                transaction: t
            });
            if (!existingUserActivity) {
                await UserActivity.create({
                    user_id: member.id,
                    activity_id: activityRole.id
                }, { transaction: t });
            }
        } else {
            console.warn(`Activity ${roleName} non trouvée.`);
        }

        await t.commit();

        // 7️⃣ Réponse finale
        return res.status(200).json({
            success: true,
            message: `L'utilisateur ${memberEmail} a été ajouté avec succès à l'agence ${agency.name} avec le rôle ${roleName}.`,
            member: {
                id: member.id,
                gmail: member.gmail,
                firstName: member.firstName,
                lastName: member.lastName,
                profileImage: member.profileImage,
                role: roleName
            }
        });

    } catch (error) {
        await t.rollback();
        console.error("Erreur lors de l'ajout du membre :", error);
        return res.status(500).json({
            success: false,
            message: "Erreur serveur.",
            error: error.message
        });
    }
};

// Fonction utilitaire pour traiter et formater les données des fichiers (No change needed here)
const formatFileForUpdate = (file, type) => {
    if (!file) return null;
    const fileData = Array.isArray(file) ? file[0] : file; 
    return {
        url: fileData.path || fileData.secure_url,
        public_id: fileData.filename || fileData.public_id, 
        type: type,
        is_principale: (type === 'MAIN_IMAGE' || type === 'MAIN_VIDEO'),
    };
};

// Fonction utilitaire pour déterminer le type de fichier (No change needed here)
const getFileType = (fieldName) => {
    switch (fieldName) {
        case 'mainImage':
            return 'MAIN_IMAGE';
        case 'mainVideo':
            return 'MAIN_VIDEO';
        case 'galleryImages':
            return 'IMAGE';
        case 'galleryVideos':
            return 'VIDEO';
        case 'document':
            return 'DOCUMENT';
        case 'audio':
            return 'AUDIO';
        case 'virtualTour':
            return 'VIRTUAL_TOUR';
        default:
            return 'OTHER';
    }
};

exports.updateAgency = async (req, res) => {
    const { agencyId } = req.params;
    const updateData = req.body; 
    const userId = req.user.userId; 
    const userRole = req.user.role; 
    const uploadedFiles = req.files;
    const { filesToDelete } = updateData; 

    const t = await sequelize.transaction();

    try {
        const agency = await Agency.findByPk(agencyId, { 
            include: [{ model: Licence, as: 'licence' }], 
            transaction: t 
        });

        if (!agency) {
            await t.rollback();
            return res.status(404).json({ 
                success: false,
                message: "L'agence n'existe pas." 
            });
        }
        
        // 1. Authorization Check (Admin or Agency Owner)
        let isAuthorized = (userRole === ADMIN_ROLE_NAME);

        if (!isAuthorized) {
            const ownerActivity = await Activity.findOne({ 
                where: { name: AGENCY_OWNER_ACTIVITY_NAME },
                transaction: t 
            });
            
            if (ownerActivity) {
                const isOwnerOfThisAgency = await UserAgency.findOne({
                    // ✅ تم التصحيح سابقاً: استخدام Snake Case
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
                message: "Vous n’avez pas l’autorisation (Admin/Owner) de modifier cette agence."
            });
        }
        
        // 2. File Deletion Logic
        const publicIdsToCleanUp = [];
        const filesToDeleteArray = Array.isArray(filesToDelete) ? filesToDelete : 
            (filesToDelete ? [filesToDelete] : []);

        if (filesToDeleteArray.length > 0) {
            const files = await AgencyFiles.findAll({
                // 🚨 التصحيح 1: استخدام public_id بدلاً من publicId في شرط where
                where: { public_id: filesToDeleteArray, agency_id: agencyId }, // 🚨 استخدام agency_id إذا كان هذا هو المفتاح الخارجي
                // 🚨 التصحيح 2: جلب public_id من قاعدة البيانات
                attributes: ['public_id'], 
                transaction: t
            });
            
            if (files.length > 0) {
                // ملاحظة: يجب استخدام public_id عند الوصول إلى السجل المسترجع
                const idsToDelete = files.map(f => f.public_id);
                
                await AgencyFiles.destroy({ 
                    // 🚨 التصحيح 3: استخدام public_id في شرط Destroy
                    where: { public_id: idsToDelete, agency_id: agencyId }, 
                    transaction: t 
                });
                // 🚨 التصحيح 4: إضافة public_id إلى قائمة التنظيف
                publicIdsToCleanUp.push(...idsToDelete); 
            }
        }

        // 3. File Creation Logic
        const filesToCreate = [];

        if (uploadedFiles) {
            for (const fieldName in uploadedFiles) {
                const fileArray = uploadedFiles[fieldName];
                if (fileArray && fileArray.length > 0) {
                    const fileType = getFileType(fieldName);
                    
                    if (fileType === 'MAIN_IMAGE' || fileType === 'MAIN_VIDEO' || fileType === 'DOCUMENT' || fileType === 'AUDIO' || fileType === 'VIRTUAL_TOUR') {
                        const oldFile = await AgencyFiles.findOne({ 
                            // 🚨 التصحيح 5: استخدام agency_id في شرط FindOne
                            where: { agency_id: agencyId, type: fileType }, 
                            transaction: t 
                        });
                        if (oldFile) {
                            await oldFile.destroy({ transaction: t });
                            // 🚨 التصحيح 6: التأكد من أن حقل publicId/public_id في oldFile صحيح
                            // نفترض هنا أن Sequelize يحول `public_id` إلى `publicId` تلقائيًا في الكائن (Default behavior)
                            // إذا لم يكن كذلك، يجب استخدام oldFile.public_id
                            publicIdsToCleanUp.push(oldFile.publicId || oldFile.public_id); 
                        }
                    }
                    
                    fileArray.forEach(file => {
                         // 🚨 التصحيح 7: استخدام agency_id عند الإنشاء
                         filesToCreate.push({
                             agency_id: agencyId, // 🚨 استخدام agency_id
                             ...formatFileForUpdate(file, fileType)
                         });
                    });
                }
            }
        }
        
        if (filesToCreate.length > 0) {
            await AgencyFiles.bulkCreate(filesToCreate, { transaction: t });
        }
        
        // 4. Agency and Licence Update Logic (Treated in the previous response - remain mostly correct)
        const dataToUpdate = { ...updateData };
        delete dataToUpdate.filesToDelete; 

        const licenceUpdateData = {};
        const agencyUpdateData = {};

        const agencyFields = ['name', 'description', 'status', 'rating', 'totalBooking', 'licence_id']; 
        
        for (const key in dataToUpdate) {
            if (agencyFields.includes(key)) {
                agencyUpdateData[key] = dataToUpdate[key]; 
            } else if (key === 'licenceType' || key === 'licenceStatus') {
                if (key === 'licenceType') licenceUpdateData.type = dataToUpdate[key]; 
                if (key === 'licenceStatus') licenceUpdateData.status = dataToUpdate[key];
            } else {
                agencyUpdateData[key] = dataToUpdate[key]; 
            }
        }

        let updatedRowsCount = 0;
        let licenceUpdated = false;

        if (Object.keys(agencyUpdateData).length > 0) {
             [updatedRowsCount] = await Agency.update(agencyUpdateData, {
                 where: { id: agencyId },
                 transaction: t,
             });
        }
        
        if (Object.keys(licenceUpdateData).length > 0 && agency.licence) {
            const [licenceRowsUpdated] = await Licence.update(licenceUpdateData, {
                where: { id: agency.licence.id }, 
                transaction: t,
            });
            licenceUpdated = licenceRowsUpdated > 0;
        }

        if (updatedRowsCount === 0 && !licenceUpdated && filesToCreate.length === 0 && filesToDeleteArray.length === 0) {
            await t.rollback();
            return res.status(400).json({ 
                success: false,
                message: "Aucun champ à mettre à jour ou les données fournies sont identiques aux données actuelles."
            });
        }
        
        // 5. Commit Transaction
        await t.commit();

        // 6. Cleanup Cloudinary (Non-blocking)
        if (publicIdsToCleanUp.length > 0) {
            deleteMultipleFiles(publicIdsToCleanUp).catch(err => {
                console.error("Erreur lors du nettoyage Cloudinary après succès BDD:", err);
            });
        }

        // 7. Fetch and Return Updated Agency
        const updatedAgency = await Agency.findByPk(agencyId, {
            include: [{ model: AgencyFiles, as: 'files' }, { model: Licence, as: 'licence' }]
        });

        return res.status(200).json({ 
            success: true, 
            message: "L'agence a été mise à jour avec succès.", 
            agency: updatedAgency 
        });

    } catch (error) {
        await t.rollback();
        // ... (Cleanup logic for uploaded files in case of failure - remains correct)
        
        const uploadedPublicIds = [];
        if (uploadedFiles) {
            Object.values(uploadedFiles).forEach(fileArray => {
                 if (Array.isArray(fileArray)) {
                     fileArray.forEach(file => {
                         if (file.filename) uploadedPublicIds.push(file.filename);
                     });
                 }
            });
        }

        if (uploadedPublicIds.length > 0) {
             deleteMultipleFiles(uploadedPublicIds).catch(err => {
                 console.error("Erreur lors du nettoyage Cloudinary après échec BDD:", err);
             });
        }
        
        return res.status(500).json({ 
            success: false,
            message: "Erreur serveur.", error: error.message 
        });
    }
};


exports.deleteAgency = async (req, res) => {
     const { agencyId } = req.params;
     const userId = req.user.userId; 
     const userRole = req.user.role; 

     const t = await sequelize.transaction();

     try {
     // 1. Fetch Agency and Licence
     const agency = await Agency.findByPk(agencyId, { 
     include: [{ model: Licence, as: 'licence' }],
     transaction: t 
     });

     if (!agency) {
     await t.rollback();
     return res.status(404).json({ success: false, message: "L'agence n'existe pas." });
     }

     if (agency.isDeleted === true) {
     await t.rollback(); // No changes were made
     return res.status(200).json({ 
     success: true, 
     message: "L'agence est déjà désactivée (suppression logique)."
     });
     }
        
        // 💡 التصحيح 1: جلب ownerActivity في البداية لضمان توفره
        const ownerActivity = await Activity.findOne({ 
            where: { name: AGENCY_OWNER_ACTIVITY_NAME },
            transaction: t
        });

        if (!ownerActivity) {
            await t.rollback();
            return res.status(500).json({ success: false, message: "Le rôle de propriétaire n’est pas défini." });
        }
     
     // 2. Authorization Check (Admin or Agency Owner of THIS agency)
     let isAuthorized = (userRole === ADMIN_ROLE_NAME);

     if (!isAuthorized) {
            // 💡 ownerActivity تم جلبه بالفعل
     
     if (ownerActivity) {
    const isOwnerOfThisAgency = await UserAgency.findOne({
     // 🚨 التصحيح 2: استخدام user_id و agency_id في UserAgency
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
     message: "Vous n’avez pas l’autorisation (Admin/Owner) de supprimer cette agence."
     });
     }

     // 3. Prepare Cloudinary Cleanup (Permanent File Deletion)
     const agencyFiles = await AgencyFiles.findAll({
     // 🚨 التصحيح 3: استخدام agency_id إذا كان هذا هو المفتاح الخارجي في AgencyFiles
            // (بناءً على مشكلة سابقة في ملفات الوكالة، نفترض أن المفتاح هو agency_id)
     where: { agency_id: agencyId }, 
     // 🚨 التصحيح 4: استخدام public_id بدلاً من publicId
     attributes: ['public_id'],
     transaction: t 
     });

     // 🚨 التصحيح 5: استخدام public_id عند التعيين
     const publicIdsToCleanup = agencyFiles.map(file => file.public_id);

     // 4. Database Deletion/Update Operations
     
     // A. Delete AgencyFiles entries (if cleanup is desired)
     if (publicIdsToCleanup.length > 0) {
     await AgencyFiles.destroy({ 
     // 🚨 التصحيح 6: استخدام agency_id
     where: { agency_id: agencyId }, 
     transaction: t 
     });
     }
     
     // B. Soft Delete the Agency (لا يوجد مفاتيح خارجية هنا)
     const [deletedRowsCount] = await Agency.update({ 
     is_deleted : true,
     status: 'deleted' 
     }, {
     where: { id: agencyId },
     transaction: t
     });

     if (deletedRowsCount === 0) {
     await t.rollback();
     return res.status(500).json({ success: false, message: "Échec de l’opération de suppression logique." });
     }
     
     // C. Update Licence Status (لا يوجد مفاتيح خارجية هنا)
     if (agency.licence) {
     await Licence.update({ status: 'deleted' }, {
    where: { id: agency.licence_id },
    transaction: t
     });
     }
        
        // 💡 ملاحظة: لم يتم تضمين إزالة الارتباطات في UserAgency، 
        // يجب حذف جميع الارتباطات من جدول UserAgency للوكالة المحذوفة.
        await UserAgency.destroy({
            where: { agency_id: agencyId },
            transaction: t
        });


     // 5. Commit Transaction
     await t.commit();

     // 6. Cloudinary Cleanup (Non-blocking post-commit)
     if (publicIdsToCleanup.length > 0) {
     deleteMultipleFiles(publicIdsToCleanup).catch(err => {
     console.error("❌ Erreur lors du nettoyage Cloudinary après succès BDD:", err);
     });
     }

     return res.status(200).json({ 
     success: true, 
     message: "L'agence a été désactivée (suppression logique) avec succès." 
     });

     } catch (error) {
     await t.rollback();
     console.error("Erreur lors de la suppression de l’agence :", error);
     return res.status(500).json({ 
     success: false,
     message: "Erreur serveur.", error: error.message 
     });
     }
};

exports.removeMemberFromAgency = async (req, res) => {
    const { agencyId, memberId } = req.params; 
    const removerUserId = req.user.userId;
    const removerRole = req.user.role; 

    const t = await sequelize.transaction();

    try {
        // 1. Check if Agency and Member exist
        const agency = await Agency.findByPk(agencyId, { transaction: t });
        const member = await User.findByPk(memberId, { attributes: ['id', 'gmail'], transaction: t });

        if (!agency || !member) {
            await t.rollback();
            return res.status(404).json({ 
                success: false, 
                message: !agency ? "L'agence n'existe pas." : "Le membre n'existe pas." 
            });
        }

        const ownerActivity = await Activity.findOne({ 
         where: { name: AGENCY_OWNER_ACTIVITY_NAME },
         transaction: t
      });

      if (!ownerActivity) {
            await t.rollback();
            return res.status(500).json({ success: false, message: "Le rôle de propriétaire n’est pas défini." });
        }
        
        // 2. Authorization Check (Admin or Agency Owner of THIS agency)
        let isAuthorized = (removerRole === ADMIN_ROLE_NAME);

        if (!isAuthorized) {

            const isRemoverOwnerOfThisAgency = await UserAgency.findOne({
                where: { user_id: removerUserId, agency_id: agencyId },
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
                transaction: t
            });

            if (isRemoverOwnerOfThisAgency) {
                 isAuthorized = true;
            }
        }
        
        if (!isAuthorized) {
            await t.rollback();
            return res.status(403).json({ 
                success: false,
                message: "Vous n’avez pas l’autorisation de retirer des membres de cette agence." 
            });
        }

        const isMemberOwner = await UserActivity.findOne({
            where: { user_id: memberId, activity_id: ownerActivity.id },
            transaction: t
        });

        if (isMemberOwner) {
             const ownerCount = await UserAgency.count({
                where: { agency_id: agencyId },
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
                transaction: t
            });

            if (ownerCount === 1) {
                 await t.rollback();
                 return res.status(400).json({ 
                     success: false,
                     message: "Impossible de retirer le seul propriétaire de l'agence. Le transfert de propriété est requis."
                 });
            }

        }
        
        // 4. Remove link from UserAgency
        const deletedRowsCount = await UserAgency.destroy({
            where: { agency_id: agencyId, user_id: memberId },
            transaction: t
        });

        if (deletedRowsCount === 0) {
            await t.rollback();
            return res.status(404).json({ success: false, message: "L'utilisateur n'est pas membre de cette agence." });
        }

        // 5. Cleanup Agency-specific Roles (CONDITIONAL removal)
        // Check if the member is linked to ANY other agency
        const otherAgencyLinks = await UserAgency.count({
             where: { user_id: memberId },
             transaction: t
        });

        if (otherAgencyLinks === 0) {
             // Only remove roles if the member is now linked to ZERO agencies
             const roleActivities = await Activity.findAll({
                 where: { name: VALID_AGENCY_MEMBER_ROLES },
                 attributes: ['id'],
                 transaction: t
             });
             
             const roleActivityIds = roleActivities.map(activity => activity.id);

             await UserActivity.destroy({
                 where: { 
                     user_id: memberId,
                     activity_id: roleActivityIds 
                 },
                 transaction: t
             });
        }

        // 6. Commit Transaction and Respond
        await t.commit();

        return res.status(200).json({ 
            success: true, 
            message: "Le membre a été retiré de l'agence et ses rôles spécifiques ont été supprimés avec succès." 
        });

    } catch (error) {
        await t.rollback();
        console.error("Erreur lors de la suppression du membre :", error);
        return res.status(500).json({ success: false, message: "Erreur serveur.", error: error.message });
    }
};