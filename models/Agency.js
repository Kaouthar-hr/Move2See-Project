const { DataTypes } = require("sequelize");
const db = require("../config/db");

const sequelize = db.getSequelize();

const Agency = sequelize.define(
    "Agency",
    {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        licence_id: {
            type: DataTypes.UUID,
            allowNull: true,
            unique: true,
        },
        total_booking: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            allowNull: false,
        },
        rating: {
            type: DataTypes.DECIMAL, 
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM('pending', 'active', 'inactive', 'suspended'),
            defaultValue: 'pending',
            allowNull: false,
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
    },
    {
        tableName: "agencies",
        timestamps: true,
        underscored: true,
    }
);

module.exports = { Agency };
