const { User } = require('../models/User');
const { generateOTP, hashOTP, verifyOTPCode } = require('../services/emailSender');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;
const OTP_EXPIRATION_MINUTES = 10;

/**
 * Generate Cloudinary URL from public ID
 */
const getCloudinaryUrl = (publicId) => {
    if (!publicId) return null;
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    return `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`;
};

/**
 * Génère un token JWT avec les informations de l'utilisateur
 */
const generateToken = (user) => {
    const payload = {
        userId: user.id,
        email: user.gmail || user.primaryIdentifier,
        phone: user.phone,
        primaryIdentifier: user.primaryIdentifier,
        isVerified: user.isVerified,
    };

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
    });
};

/**
 * Formate les données utilisateur pour la réponse (sans mot de passe)
 */
const formatUserResponse = (user) => {
    return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.gmail || user.primaryIdentifier,
        phone: user.phone,
        profileImage: user.profileImage,
        banner: user.banner,
        profileDescription: user.profileDescription,
        country: user.country,
        totalFollowers: user.totalFollowers,
        totalCommunities: user.totalCommunities,
        isVerified: user.isVerified,
        isActive: user.isActive,
        isProfileCompleted: user.isProfileCompleted,
        role: user.role || 'user',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
};

/**
 * Inscription d'un nouvel utilisateur
 * POST /auth/register
 */
const registerUser = async (req, res) => {
    try {
        // Vérification des erreurs de validation
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Erreurs de validation',
                code: 'VALIDATION_ERROR',
                details: errors.array(),
            });
        }

        const { firstName, lastName, email, mobileNumber, password } = req.body;

        // Vérifier si l'utilisateur existe déjà (par email ou téléphone)
        const existingUserByEmail = await User.findOne({
            where: { gmail: email },
        });

        if (existingUserByEmail) {
            return res.status(409).json({
                success: false,
                error: 'Un compte existe déjà avec cet email',
                code: 'EMAIL_ALREADY_EXISTS',
            });
        }

        // Vérifier si l'utilisateur est supprimé (soft delete)
        if (existingUserByEmail && existingUserByEmail.isDeleted) {
            return res.status(403).json({
                success: false,
                error: 'Ce compte a été supprimé. Veuillez contacter le support.',
                code: 'ACCOUNT_DELETED',
            });
        }

        // Hash du mot de passe
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Générer le primaryIdentifier (email normalisé)
        const primaryIdentifier = email.toLowerCase().trim();

        // Créer l'utilisateur
        const newUser = await User.create({
            firstName: firstName,
            lastName: lastName,
            gmail: email.toLowerCase().trim(),
            phone: mobileNumber,
            password: hashedPassword,
            primaryIdentifier: primaryIdentifier,
            isVerified: true,
            isActive: true,
            isDeleted: false,
        });

        // Générer et envoyer l'OTP
        // const otp = generateOTP();
        // const hashedOtp = await hashOTP(otp);
        // Créer le nouvel OTP
        // const expiresAt = new Date();
        // expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRATION_MINUTES);

        // await EmailVerification.create({
        //     email: email.toLowerCase().trim(),
        //     otp: hashedOtp,
        //     expiresAt: expiresAt,
        // });

        // Envoyer l'email de vérification
        // try {
        //     await sendVerificationEmail(email, otp, `${firstName} ${lastName}`);
        // } catch (emailError) {
        //     console.error('Erreur lors de l\'envoi de l\'email:', emailError);
        //     // Ne pas bloquer l'inscription si l'email échoue, mais logger l'erreur
        // }

        // Générer le token JWT
        const token = generateToken(newUser);

        // Set HTTP-only cookie for web
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // HTTPS only in production
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        // Return token in response body for mobile apps
        return res.status(201).json({
            success: true,
            message: 'Inscription réussie. Veuillez vérifier votre email.',
            data: {
                token: token,
                user: formatUserResponse(newUser),
            },
        });
    } catch (error) {
        console.error('Erreur lors de l\'inscription:', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'inscription',
            code: 'REGISTRATION_ERROR',
            message: error.message,
        });
    }
};

/**
 * Connexion d'un utilisateur
 * POST /auth/login
 */
const loginUser = async (req, res) => {
    try {
        // Vérification des erreurs de validation
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Erreurs de validation',
                code: 'VALIDATION_ERROR',
                details: errors.array(),
            });
        }

        const { email, password } = req.body;

        // Rechercher l'utilisateur par email (gmail ou primaryIdentifier)
        const user = await User.findOne({
            where: {
                gmail: email.toLowerCase().trim(),
            },
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Email ou mot de passe incorrect',
                code: 'INVALID_CREDENTIALS',
            });
        }

        // Vérifier si le compte est supprimé
        if (user.isDeleted) {
            return res.status(403).json({
                success: false,
                error: 'Ce compte a été supprimé. Veuillez contacter le support.',
                code: 'ACCOUNT_DELETED',
            });
        }

        // Vérifier si le compte est actif
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                error: 'Ce compte a été désactivé. Veuillez contacter le support.',
                code: 'ACCOUNT_INACTIVE',
            });
        }

        // Vérifier le mot de passe
        if (!user.password) {
            return res.status(401).json({
                success: false,
                error: 'Ce compte utilise une connexion sociale. Veuillez vous connecter avec votre compte social.',
                code: 'SOCIAL_LOGIN_REQUIRED',
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                error: 'Email ou mot de passe incorrect',
                code: 'INVALID_CREDENTIALS',
            });
        }

        // Générer le token JWT
        const token = generateToken(user);

        // Set HTTP-only cookie for web
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // HTTPS only in production
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        // Return token in response body for mobile apps
        // Web apps will ignore it and use the cookie instead
        return res.status(200).json({
            success: true,
            message: 'Connexion réussie',
            data: {
                token: token,
                user: formatUserResponse(user),
            },
        });
    } catch (error) {
        console.error('Erreur lors de la connexion:', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur lors de la connexion',
            code: 'LOGIN_ERROR',
            message: error.message,
        });
    }
};


/**
 * Déconnexion d'un utilisateur
 * POST /auth/logout
 */
const logoutUser = async (req, res) => {
    try {
        // Clear the HTTP-only cookie
        res.clearCookie('authToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        });

        return res.status(200).json({
            success: true,
            message: 'Déconnexion réussie',
        });
    } catch (error) {
        console.error('Erreur lors de la déconnexion:', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur lors de la déconnexion',
            code: 'LOGOUT_ERROR',
            message: error.message,
        });
    }
};

module.exports = {
    registerUser,
    loginUser,
    logoutUser,
};

