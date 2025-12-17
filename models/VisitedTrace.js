const { DataTypes } = require("sequelize");
const db = require("../config/db");
const sequelize = db.getSequelize();

const VisitedTrace = sequelize.define(
    "VisitedTrace",
    {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
            allowNull: false,
        },
        routeId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'route_id'
        },
        poiId: {
            type: DataTypes.UUID,
            allowNull: true,
            field: 'poi_id'
        },
        order: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        lat: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true
    },
    lng: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true
    },
    },
    {
        tableName: "visited_traces",
        timestamps: true,
        underscored: true,
    }
);

module.exports = { VisitedTrace };