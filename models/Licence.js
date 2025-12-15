const { DataTypes } = require("sequelize");
const db = require("../config/db"); 
const sequelize = db.getSequelize();

const Licence = sequelize.define(
    "Licence",
    {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
        },
        file_url: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        cloudinary_id: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        type: {
            type: DataTypes.STRING, 
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM('pending', 'validated', 'rejected', 'expired'),
            allowNull: true,
        },
    },
    {
        tableName: "licences",
        timestamps: true, 
        underscored: true, 
    }
);

module.exports = { Licence };
