const { DataTypes } = require("sequelize");
const db = require("../config/db");

const sequelize = db.getSequelize();

const Activity = sequelize.define(
    "Activity",
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
            unique: true, 
        },
        description: {
            type: DataTypes.TEXT, 
            allowNull: true,
        },
    },
    {
        tableName: "activities",
        timestamps: true,
        underscored: true,
    }
);

module.exports = { Activity };
