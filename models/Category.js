const { DataTypes } = require("sequelize");
const db = require("../config/db");

const sequelize = db.getSequelize();

    const Category = sequelize.define('Category', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        ar: { type: DataTypes.JSON, allowNull: true },
        en: { type: DataTypes.JSON, allowNull: true },
        fr: { type: DataTypes.JSON, allowNull: true },
        is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
         is_deleted: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },
    }, {
        tableName: 'categories',
        timestamps: true,
        //underscored: true,
    });


module.exports = { Category };

    

