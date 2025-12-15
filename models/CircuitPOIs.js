const { DataTypes } = require("sequelize");
const db = require("../config/db");

const sequelize = db.getSequelize();

    const CircuitPOIs = sequelize.define('CircuitPOIs', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        circuitId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        poiId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        order: {
            type: DataTypes.INTEGER,
            allowNull: false
        }
    }, {
        tableName: 'circuit_pois',
        timestamps: false,
        //underscored: true,
    });


module.exports = { CircuitPOIs };
