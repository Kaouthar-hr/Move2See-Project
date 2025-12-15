const { DataTypes } = require("sequelize");
const db = require("../config/db");

const sequelize = db.getSequelize();

const AgencyVehicle = sequelize.define(
    "AgencyVehicle",
    {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
        },
        agency_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        capacity: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        photo_url: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        cloudinary_id: {
            type: DataTypes.STRING,
            allowNull: true,
        }
    },
    {
        tableName: "agency_vehicles",
        timestamps: true,
        underscored: true,
    }
);

module.exports = { AgencyVehicle };
