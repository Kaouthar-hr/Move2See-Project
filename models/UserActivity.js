const { DataTypes } = require("sequelize");
const db = require("../config/db");

const sequelize = db.getSequelize();

const UserActivity = sequelize.define(
    "UserActivity",
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
        activity_id: {
            type: DataTypes.UUID,
            allowNull: false,
        }
    },
    {
        tableName: "user_activities",
        timestamps: true,
        underscored: true,
        indexes: [
            { unique: true, fields: ["user_id", "activity_id"] }
        ]
    }
);

module.exports = { UserActivity };
