const bcrypt = require('bcryptjs');

/**
 * Génère un code OTP à 6 chiffres
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Hash le code OTP avant de le sauvegarder
 */
const hashOTP = async (otp) => {
  const saltRounds = 10;
  return await bcrypt.hash(otp, saltRounds);
};

/**
 * Vérifie si le code OTP correspond au hash
 */
const verifyOTPCode = async (otp, hashedOtp) => {
  return await bcrypt.compare(otp, hashedOtp);
};

/**
 * Envoie un email de vérification avec le code OTP
 */

module.exports = {
  generateOTP,
  hashOTP,
  verifyOTPCode: verifyOTPCode,
};

