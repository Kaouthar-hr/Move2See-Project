const { DataTypes } = require("sequelize");
const db = require("../config/db");

const sequelize = db.getSequelize();

    const Circuit = sequelize.define('Circuit', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        agencyId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false
        },
        description: {
            type: DataTypes.STRING
        },
        price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        seats: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        departureCity: {
            type: DataTypes.UUID ,
            allowNull: false
        },
        destinationCity: {
            type: DataTypes.UUID 
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        isDeleted: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        tableName: 'circuits',
        timestamps: true,
        //underscored: true,
    });


module.exports = { Circuit };