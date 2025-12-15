const { DataTypes } = require("sequelize");
const db = require("../config/db");

const sequelize = db.getSequelize();

const UserAgency = sequelize.define(
    "UserAgency",
    {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        agency_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
    },
    {
        tableName: "user_agencies",
        timestamps: true,
        underscored: true,
    }
);

module.exports = { UserAgency };
