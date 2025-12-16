const { DataTypes } = require("sequelize");
const db = require("../config/db");
const sequelize = db.getSequelize();

const Route = sequelize.define(
    "Route",
    {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
        },
        circuitId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'circuit_id'
        },
        userId: {
            type: DataTypes.UUID, // Le créateur (Guide/Chauffeur)
            allowNull: false,
            field: 'user_id'
        },
        vehicleId: {
            type: DataTypes.UUID,
            allowNull: true,
            field: 'vehicle_id'
        },
        dateStart: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'date_start'
        },
        hours: {
            type: DataTypes.STRING, // Pour stocker l'heure prévue
            allowNull: true,
        },
        price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        seats: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM("scheduled", "cancelled", "ongoing", "paused", "completed"),
            defaultValue: "scheduled",
            allowNull: false,
        },
    },
    {
        tableName: "routes",
        timestamps: true,
        underscored: true,
    }
);

module.exports = { Route };