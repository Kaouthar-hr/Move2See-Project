// middleware/activityMiddleware.js

const { UserActivity, Activity } = require('../models'); 
const ADMIN_ROLE_NAME = 'Admin'; 

/**
 * @description Middleware pour vérifier si un utilisateur possède l'une des activités requises.
 * Vérifie d'abord si l'utilisateur est un 'Admin' (super-utilisateur) via le champ 'role' du modèle User.
 * @param {string|Array<string>} requiredActivities - Nom ou tableau de noms d'activité/rôles requis.
 * @returns {Function} La fonction middleware Express.
 */
const activityMiddleware = (requiredActivities) => {

    // Assurez-vous que requiredActivities est toujours un tableau
    const requiredActivitiesArray = Array.isArray(requiredActivities) 
                                     ? requiredActivities 
                                     : [requiredActivities];

    return async (req, res, next) => {
        const userId = req.user && req.user.userId; 

        // --- 1. Vérification d'Authentification ---
        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: "Accès non autorisé. Authentification requise (ID manquant)." 
            });
        }

        // --- 2. VÉRIFICATION DU RÔLE SUPER-ADMIN (Champ direct sur le modèle User) ---
        if (req.user.role === ADMIN_ROLE_NAME) {
            return next(); // L'administrateur a accès à tout
        }
        
        // --------------------------------------------------------------------------
        // 💡 التعديل الرئيسي: تنقية قائمة الأنشطة للبحث في جدول Activity
        // --------------------------------------------------------------------------
        
        // 3. بناء قائمة الأنشطة التي يجب البحث عنها في جدول 'Activity'
        // نستثني 'Admin' من البحث في هذا الجدول
        const activitiesToSearchInDB = requiredActivitiesArray.filter(
            activityName => activityName !== ADMIN_ROLE_NAME
        );
        
        // إذا كانت القائمة فارغة (مثلاً، إذا كان المطلوب هو 'Admin' فقط، وقد فشل التحقق في الخطوة 2)، 
        // فهذا يعني أن المستخدم غير مصرح له.
        if (activitiesToSearchInDB.length === 0 && requiredActivitiesArray.includes(ADMIN_ROLE_NAME)) {
             // إذا كان المستخدم ليس Admin (التحقق فشل في الخطوة 2)، والمطلوب كان Admin فقط
             return res.status(403).json({ 
                success: false, 
                message: "Accès interdit. Rôle/Activité insuffisante(s)." 
            });
        }
        
        // إذا لم يكن هناك أنشطة نبحث عنها في BDD، ننتقل إلى الخطوة 5 (التي يجب أن تفشل إذا لم يكن Admin)
        if (activitiesToSearchInDB.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: "Accès interdit. Rôle/Activité insuffisante(s)." 
            });
        }


        try {
            // 4. البحث عن IDs للأنشطة المطلوبة (باستثناء Admin)
            const requiredActivityRecords = await Activity.findAll({
                where: {
                    name: activitiesToSearchInDB // استخدام القائمة المُصّححة
                },
                attributes: ['id']
            });

            const requiredActivityIds = requiredActivityRecords.map(a => a.id);
            
            if (requiredActivityIds.length === 0) {
                 // هذا يعني أن الأنشطة المطلوبة غير موجودة في قاعدة البيانات (خطأ في الإعداد)
                 console.warn(`[ActivityMiddleware] Aucune activité BDD trouvée pour les noms: ${activitiesToSearchInDB.join(', ')}`);
                 return res.status(500).json({ 
                     success: false, 
                     message: "Erreur de configuration: Rôle requis non configuré correctement." 
                 });
            }


            // 5. التحقق من امتلاك المستخدم للنشاط
            const userHasRequiredActivity = await UserActivity.findOne({
                where: {
                    user_id: userId,
                    activity_id: requiredActivityIds 
                }
            });

            if (userHasRequiredActivity) {
                // المستخدم يملك النشاط المطلوب
                next();
            } else {
                // المستخدم لا يملك النشاط المطلوب
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