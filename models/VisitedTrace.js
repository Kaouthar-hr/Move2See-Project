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
            allowNull: false,
            field: 'poi_id'
        },
        order: {
            type: DataTypes.INTEGER,
            allowNull: false,
        }
    },
    {
        tableName: "visited_traces",
        timestamps: true,
        underscored: true,
    }
);

module.exports = { VisitedTrace };