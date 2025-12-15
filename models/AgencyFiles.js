const { DataTypes } = require("sequelize");
const db = require("../config/db");

const sequelize = db.getSequelize();

const AgencyFiles = sequelize.define(
    "AgencyFiles",
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
        is_principale: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        url: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM(
                "IMAGE",
                "MAIN_IMAGE",
                "VIDEO",
                "MAIN_VIDEO",
                "DOCUMENT",
                "AUDIO",
                "VIRTUAL_TOUR"
            ),
            allowNull: false
        },
        public_id: {
            type: DataTypes.STRING,
            allowNull: false,
        },
    },
    {
        tableName: "agency_files",
        timestamps: true,
        underscored: true,
    }
);

module.exports = { AgencyFiles };
