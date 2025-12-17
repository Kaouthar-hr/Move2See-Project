
const { UserActivity, Activity } = require('../models'); 
const ADMIN_ROLE_NAME = 'Admin'; 

/**
 * @description Middleware pour vérifier si un utilisateur possède l'une des activités requises.
 * Vérifie d'abord si l'utilisateur est un 'Admin' (super-utilisateur) via le champ 'role' du modèle User.
 * @param {string|Array<string>} requiredActivities - Nom ou tableau de noms d'activité/rôles requis.
 * @returns {Function} La fonction middleware Express.
 */
const activityMiddleware = (requiredActivities) => {

    const requiredActivitiesArray = Array.isArray(requiredActivities) 
                                     ? requiredActivities 
                                     : [requiredActivities];

    return async (req, res, next) => {
        const userId = req.user && req.user.userId; 

        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: "Accès non autorisé. Authentification requise (ID manquant)." 
            });
        }

        if (req.user.role === ADMIN_ROLE_NAME) {
            return next(); 
        }
        
        
        const activitiesToSearchInDB = requiredActivitiesArray.filter(
            activityName => activityName !== ADMIN_ROLE_NAME
        );
        
        if (activitiesToSearchInDB.length === 0 && requiredActivitiesArray.includes(ADMIN_ROLE_NAME)) {
             return res.status(403).json({ 
                success: false, 
                message: "Accès interdit. Rôle/Activité insuffisante(s)." 
            });
        }
        
        if (activitiesToSearchInDB.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: "Accès interdit. Rôle/Activité insuffisante(s)." 
            });
        }


        try {
            const requiredActivityRecords = await Activity.findAll({
                where: {
                    name: activitiesToSearchInDB 
                },
                attributes: ['id']
            });

            const requiredActivityIds = requiredActivityRecords.map(a => a.id);
            
            if (requiredActivityIds.length === 0) {
                 console.warn(`[ActivityMiddleware] Aucune activité BDD trouvée pour les noms: ${activitiesToSearchInDB.join(', ')}`);
                 return res.status(500).json({ 
                     success: false, 
                     message: "Erreur de configuration: Rôle requis non configuré correctement." 
                 });
            }


            const userHasRequiredActivity = await UserActivity.findOne({
                where: {
                    user_id: userId,
                    activity_id: requiredActivityIds 
                }
            });

            if (userHasRequiredActivity) {
                next();
            } else {
                return res.status(403).json({ 
                    success: false, 
                    message: "Accès interdit. Rôle/Activité insuffisante(s)." 
                });
            }

        } catch (error) {
            console.error("Erreur dans le middleware d'activité:", error);
            return res.status(500).json({ 
                success: false, 
                message: "Erreur serveur lors de la vérification des rôles." 
            });
        }
    };
};

module.exports = activityMiddleware;