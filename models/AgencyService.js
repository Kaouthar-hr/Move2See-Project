const { DataTypes } = require("sequelize");
const db = require("../config/db");

const sequelize = db.getSequelize();

    const AgencyService = sequelize.define('AgencyService', {
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
        serviceId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        price: {
            type: DataTypes.DECIMAL(10, 2), 
            allowNull: false
        },
   
    }, {
        tableName: 'agency_services',
        timestamps: true, 
        //underscored: true,
    });

    AgencyService.associate = (models) => {
        AgencyService.belongsTo(models.Agency, {
            foreignKey: 'agencyId',
            as: 'agency'
        });

        AgencyService.belongsTo(models.Service, {
            foreignKey: 'serviceId',
            as: 'service'
        });
    };
    module.exports = { AgencyService };

