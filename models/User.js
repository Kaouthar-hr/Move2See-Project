const { DataTypes } = require("sequelize");
const db = require("../config/db");

const sequelize = db.getSequelize();

const User = sequelize.define(
    "User",
    {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
            
        },
        firstName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        lastName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        gmail: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: false,
        },
        phone: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: false,
        },
        googleId: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: false,
        },
        facebookId: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: false,
        },
        provider: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        primaryIdentifier: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: false,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        profileImage: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        banner: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        cloudinaryImagePublicId: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        cloudinaryBannerPublicId: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        profileDescription: {
			type: DataTypes.TEXT,
			allowNull: true,
		},
        isVerified: {
			type: DataTypes.BOOLEAN,
			defaultValue: false,
			allowNull: false,
		},
        role: {
			type: DataTypes.ENUM("USER", "Admin"),
            allowNull: false,
            defaultValue: "USER"
        },
        isDeleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
            allowNull: false,
        },
        lastLoginDate: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'last_login_date'
    },
	},
	{
		tableName: "users",
		timestamps: true,
		underscored: true,
	}
);

module.exports = { User };