const express = require("express");
const cors = require("cors");
const morgan = require('morgan');
const logger = require('./config/logger');
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
dotenv.config();

const db = require("./config/db.js"); // Importer l'instance Singleton de la base de données
const models = require("./models/index.js");
//const { cleanupExpiredOTPs } = require("./services/cronJobs.js");

const app = express();
const { header } = require("express-validator");
const rateLimit = require("express-rate-limit");

// Charger les variables sensibles depuis le fichier .env
const PORT = process.env.PORT || 8080;
const ALLOWED_ORIGINS = [
    process.env.CLIENT_URL,
    process.env.MOBILE_ON_WEB_URL,
    // Permettre les connexions depuis les appareils mobiles en développement
    // Les requêtes depuis React Native n'ont pas d'origin, donc on autorise les requêtes sans origin
    undefined, // Permet les requêtes sans origin (appareils mobiles)
    null,
];


console.log(process.env.CLIENT_URL);
app.use(
    cors({

        origin: (origin, callback) => {
            // En développement, autoriser toutes les origines pour faciliter les tests
            if (process.env.NODE_ENV !== 'production') {
                callback(null, true);
            } else if (!origin || ALLOWED_ORIGINS.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'), false);
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-CSRF-Token",
            "x-method",
        ],
        exposedHeaders: ["Content-Range", "X-Content-Range", "X-CSRF-Token"],
        preflightContinue: false,
        optionsSuccessStatus: 204,
    })
);

// Configuration de Helmet pour ne pas bloquer les requêtes API
app.use(helmet({
    contentSecurityPolicy: false, // Désactiver CSP pour les API
    crossOriginEmbedderPolicy: false,
}));

// Middleware pour parser les cookies
app.use(cookieParser());

// Middleware pour parser le body JSON
app.use(express.json());

app.use(morgan('combined', { stream: logger.stream }));

// Limiter les requêtes à 100 par heure par IP
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // max 1000 requêtes par minute
    message: "Trop de requêtes, réessayez dans une minute.",
});

app.use(limiter);

// Middleware pour forcer le Content-Type JSON pour toutes les routes API
// Doit être placé AVANT les routes pour s'appliquer à toutes les réponses
app.use('/api', (req, res, next) => {
    // S'assurer que toutes les réponses API sont en JSON
    res.setHeader('Content-Type', 'application/json');
    next();
});

// Importer les routes
const { authRouter } = require('./routes/authRoutes');
const agencyRouter = require('./routes/agencyRoutes');
const agencyVehicleRouter = require('./routes/agencyVehicleRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const {poiRouter} = require('./routes/poiRoutes');
const categoryRoutes = require("./routes/categoryRoutes.js");


// Enregistrer les routes avec le préfixe /api
 app.use('/api/auth', authRouter);
app.use('/api/agencies', agencyRouter);
app.use('/api/agencyVehicles', agencyVehicleRouter);
app.use('/api/services', serviceRoutes);
app.use('/api/pois',poiRouter);
app.use('/api/categorys', categoryRoutes);

// Route de test pour vérifier que le serveur fonctionne
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
    });
});

// Middleware pour gérer les routes non trouvées (404) - Retourner du JSON au lieu de HTML
// Doit être placé APRÈS toutes les routes pour capturer les routes non matchées
app.use((req, res, next) => {
    // Si c'est une route API qui n'a pas été matchée
    if (req.path.startsWith('/api')) {
        return res.status(404).json({
            success: false,
            error: 'Route non trouvée',
            code: 'ROUTE_NOT_FOUND',
            message: `La route ${req.method} ${req.originalUrl} n'existe pas`,
        });
    }
    // Pour les autres routes, continuer
    next();
});

// Middleware de gestion d'erreurs global - S'assurer que toutes les erreurs retournent du JSON
app.use((err, req, res, next) => {
    // Si la requête est pour l'API, retourner du JSON
    if (req.path.startsWith('/api')) {
        console.error('Erreur API:', err);
        res.status(err.status || 500).json({
            success: false,
            error: err.message || 'Erreur serveur',
            code: err.code || 'SERVER_ERROR',
            message: process.env.NODE_ENV === 'production' ? 'Une erreur est survenue' : err.message,
        });
    } else {
        // Pour les autres routes, passer à l'erreur suivante
        next(err);
    }
});

// Fonction pour démarrer le serveur
function startServer() {
    // En développement, écouter sur toutes les interfaces (0.0.0.0) pour permettre l'accès depuis les appareils mobiles
    // En production, vous pouvez spécifier une IP spécifique
    const HOST = process.env.NODE_ENV === 'production' ? process.env.HOST : '0.0.0.0';
    
    app.listen(PORT, HOST, () => {
        logger.info(`Server is running on http://${HOST}:${PORT}`);
    });
}

db.initializeDatabase()
    .then(() => {
        // Démarrer le serveur
        startServer();

        // Démarrer le job CRON pour nettoyer les OTP expirés
        // 	cleanupExpiredOTPs.start();
        // 	console.log('✅ Job CRON de nettoyage des OTP expirés démarré');
    })
    .catch((error) => {

        logger.error(`Erreur lors de l'initialisation de l'application :
            ${error}`);
        process.exit(1); // Arrêter l'application en cas d'échec critique
    });

//  db.dropAllIndexes()
