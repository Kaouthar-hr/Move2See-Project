/**
 * Routes d'authentification - Compatible avec le frontend React Native
 * 
 * Flux d'authentification :
 * 1. POST /register (signup.tsx) → firstName, lastName, email, mobileNumber, password, confirmPassword, agreeToTerms
 * 2. POST /sendOTP (otp.tsx) → email (si nécessaire, peut être appelé automatiquement après register)
 * 3. POST /verifyOTP (otp.tsx) → email, otp (6 chiffres)
 * 4. POST /resendOTP (otp.tsx) → email
 * 5. POST /login (login.tsx) → email, password
 */

const express = require('express');
const { body } = require('express-validator');

const {
  registerUser,
  loginUser,
  logoutUser,
} = require('../controllers/authController.js');

const AuthRouter = express.Router();

// Validation rules pour l'authentification
const registerValidation = [
  body('firstName')
    .notEmpty()
    .withMessage('Le prénom est requis')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères'),
  body('lastName')
    .notEmpty()
    .withMessage('Le nom est requis')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères'),
  body('email')
    .notEmpty()
    .withMessage('L\'email est requis')
    .trim()
    .isEmail()
    .withMessage('Format d\'email invalide')
    .normalizeEmail(),
  body('mobileNumber')
    .notEmpty()
    .withMessage('Le numéro de téléphone est requis')
    .trim()
    .matches(/^(\+?[1-9]\d{1,14}|0\d{9})$/)
    .withMessage('Format de numéro de téléphone invalide. Doit commencer par + suivi d\'un chiffre de 1-9, ou commencer par 0 et contenir 10 chiffres'),
  body('password')
    .notEmpty()
    .withMessage('Le mot de passe est requis')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères'),
  body('confirmPassword')
    .notEmpty()
    .withMessage('La confirmation du mot de passe est requise')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Les mots de passe ne correspondent pas');
      }
      return true;
    }),
  body('agreeToTerms')
    .custom((value) => {
      if (value !== true && value !== 'true') {
        throw new Error('Vous devez accepter les conditions d\'utilisation');
      }
      return true;
    }),
];

const loginValidation = [
  body('email')
    .notEmpty()
    .withMessage('L\'email est requis')
    .trim()
    .isEmail()
    .withMessage('Format d\'email invalide')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Le mot de passe est requis'),
];



// Routes d'authentification (publiques)
AuthRouter.post('/register', registerValidation, registerUser);
AuthRouter.post('/login', loginValidation, loginUser);
AuthRouter.post('/logout', logoutUser);

module.exports = { authRouter: AuthRouter };

