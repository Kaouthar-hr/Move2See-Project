const { User } = require("./User");
const { Agency } = require("./Agency");
const { AgencyFiles } = require("./AgencyFiles");
const { UserAgency } = require("./UserAgency");
const { Activity } = require("./Activity");
const { UserActivity } = require("./UserActivity");
const { Licence } = require("./Licence");
const { AgencyVehicle } = require("./AgencyVehicle");
const { Service } = require("./Service");
const { AgencyService } = require("./AgencyService");
const { Circuit } = require("./Circuit");
const { CircuitPOIs } = require("./CircuitPOIs");
const { POI } = require("./POI");
const { POIFile } = require("./POIFile");
const { POILocalization } = require("./POILocalization");
const { City } = require("./City");
const { Category } = require("./Category");
// const { Route } = require("./Route");
// const { VisitedTrace } = require("./VisitedTrace");

// ------------------ AGENCY <-> AGENCYFILES ------------------
Agency.hasMany(AgencyFiles, {
    foreignKey: "agency_id",
    as: "files",
});
AgencyFiles.belongsTo(Agency, {
    foreignKey: "agency_id",
    as: "agency",
});

// ------------------ USER <-> AGENCY via USERAGENCY ------------------
// Many-to-Many direct association pour faciliter l'inclusion
User.belongsToMany(Agency, {
    through: UserAgency,
    foreignKey: "user_id",
    otherKey: "agency_id",
    as: "agencies",
});
Agency.belongsToMany(User, {
    through: UserAgency,
    foreignKey: "agency_id",
    otherKey: "user_id",
    as: "members",
});

// Garder les associations existantes pour UserAgency si besoin
User.hasMany(UserAgency, { foreignKey: "user_id", as: "memberships" });
UserAgency.belongsTo(User, { foreignKey: "user_id", as: "user" });

Agency.hasMany(UserAgency, { foreignKey: "agency_id", as: "userAgencies" });
UserAgency.belongsTo(Agency, { foreignKey: "agency_id", as: "agency" });

// ------------------ USER <-> ACTIVITY via USERACTIVITY ------------------
User.belongsToMany(Activity, {
    through: UserActivity,
    foreignKey: "user_id",
    otherKey: "activity_id",
    as: "activities",
});
Activity.belongsToMany(User, {
    through: UserActivity,
    foreignKey: "activity_id",
    otherKey: "user_id",
    as: "usersWithActivity",
});

// Garder les associations existantes pour UserActivity si besoin
User.hasMany(UserActivity, { foreignKey: "user_id", as: "userActivities" });
UserActivity.belongsTo(User, { foreignKey: "user_id", as: "user" });

Activity.hasMany(UserActivity, { foreignKey: "activity_id", as: "activityLinks" });
UserActivity.belongsTo(Activity, { foreignKey: "activity_id", as: "activity" });

// ------------------ AGENCY <-> LICENCE ------------------
Licence.hasOne(Agency, {
    foreignKey: "licence_id",
    as: "agency",
});
Agency.belongsTo(Licence, {
    foreignKey: "licence_id",
    as: "licence",
});

// ------------------ AGENCY <-> VEHICLES ------------------
Agency.hasMany(AgencyVehicle, {
    foreignKey: "agency_id",
    as: "vehicles",
});
AgencyVehicle.belongsTo(Agency, {
    foreignKey: "agency_id",
    as: "agency",
});
// ------------------ AGENCY <-> AGENCY SERVICE <-> SERVICE ------------------

Service.hasMany(AgencyService, {
    foreignKey: 'serviceId', 
    as: 'agencyServices'
});

AgencyService.belongsTo(Agency, {
    foreignKey: 'agencyId',
    as: 'agency'
});

AgencyService.belongsTo(Service, {
    foreignKey: 'serviceId',
    as: 'service'
});


Circuit.belongsTo(Agency, {
    foreignKey: 'agencyId',
    as: 'agency'
});
Circuit.hasMany(CircuitPOIs, {
    foreignKey: 'circuitId',
    as: 'circuitPois'
});


CircuitPOIs.belongsTo(Circuit, {
    foreignKey: 'circuitId',
    as: 'circuit'
});

CircuitPOIs.belongsTo(POI, {
    foreignKey: 'poiId',
    as: 'poi'
});

// Associations POI ↔ City
POI.belongsTo(City, {
    as: "city",
    foreignKey: "cityId", 
    targetKey: "id",
	onDelete: 'RESTRICT',
	onUpdate: 'CASCADE'
});

City.hasMany(POI, {
    as: "pois",
    foreignKey: "cityId",
	onDelete: 'RESTRICT',
	onUpdate: 'CASCADE'
});

POI.belongsTo(Category, {
  foreignKey: 'category',
  as: 'categoryPOI',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

      
        
POI.hasMany(CircuitPOIs, {
    foreignKey: 'poiId',
    as: 'circuitPOIs'
});

Category.hasMany(POI, {
  foreignKey: 'category',
  as: 'pois',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

//  Associations POI ↔ POIFile
POI.hasMany(POIFile, {
	as: "files",
	foreignKey: "poiId",
	sourceKey: "id",
	onDelete: 'CASCADE',
	onUpdate: 'CASCADE'
});
POIFile.belongsTo(POI, {
	as: "poi",
	foreignKey: "poiId",
	targetKey: "id",
	onDelete: 'CASCADE',
	onUpdate: 'CASCADE'
});
   

//  Associations POI ↔ POILocalization
POI.belongsTo(POILocalization, {
    as: "arLocalization",
    foreignKey: "ar",
    targetKey: "id",
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
});
POI.belongsTo(POILocalization, {
    as: "frLocalization",
    foreignKey: "fr",
    targetKey: "id",
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
});
POI.belongsTo(POILocalization, {
    as: "enLocalization",
    foreignKey: "en",
    targetKey: "id",
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
});

POILocalization.hasMany(POI, {
    as: "arPOIs",
    foreignKey: "ar",
    sourceKey: "id",
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
});
POILocalization.hasMany(POI, {
    as: "frPOIs",
    foreignKey: "fr",
    sourceKey: "id",
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
});
POILocalization.hasMany(POI, {
    as: "enPOIs",
    foreignKey: "en",
    sourceKey: "id",
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
});

//  CIRCUIT <-> POI via CIRCUITPOIs (Many-to-Many) 

Circuit.belongsToMany(POI, {
    through: CircuitPOIs, 
    foreignKey: 'circuitId', 
    otherKey: 'poiId',
    as: 'pois' 
});

POI.belongsToMany(Circuit, {
    through: CircuitPOIs,
    foreignKey: 'poiId',
    otherKey: 'circuitId',
    as: 'circuits'
});

module.exports = {
    User,
    Agency,
    AgencyFiles,
    UserAgency,
    Activity,
    UserActivity,
    Licence,
    AgencyVehicle,
    Service,
    AgencyService,
    Circuit,
    CircuitPOIs,
    POI,
    POIFile,
    City,
    Category,
    POILocalization,
    // Route,
    // VisitedTrace
};
