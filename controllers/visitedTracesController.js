const { VisitedTrace, Route, CircuitPOIs, POI, sequelize } = require("../models");
const { Op } = require("sequelize");

const checkGeofencing = async (routeId, lat, lng) => {
    const radiusInKm = 0.1; 
    const earthRadius = 6371;

    try {
        const route = await Route.findByPk(routeId);
        if (!route) return null;

        const haversineFormula = `(
            ${earthRadius} * acos(
                cos(radians(${lat})) * cos(radians(JSON_EXTRACT(coordinates, "$.latitude"))) * cos(radians(JSON_EXTRACT(coordinates, "$.longitude")) - radians(${lng})) + 
                sin(radians(${lat})) * sin(radians(JSON_EXTRACT(coordinates, "$.latitude")))
            )
        )`;

        const nearbyPOI = await CircuitPOIs.findOne({
            where: { circuitId: route.circuitId },
            include: [{
                model: POI,
                as: 'poi',
                attributes: [
                    'id',
                    'coordinates',
                    [sequelize.literal(haversineFormula), 'distance']
                ]
            }],
            having: sequelize.literal(`${haversineFormula} <= ${radiusInKm}`),
            order: [[sequelize.literal(haversineFormula), 'ASC']]
        });

        if (nearbyPOI && nearbyPOI.poi) {
            return {
                id: nearbyPOI.poi.id,
                order: nearbyPOI.order 
            };
        }
        return null;
    } catch (error) {
        console.error("Geofencing Error Detail:", error.message);
        return null;
    }
};

exports.addTracePoint = async (req, res) => {
    try {
        const { routeId, lat, lng, timestamp } = req.body;
        const authUserId = req.user.userId;

        const route = await Route.findOne({ 
            where: { id: routeId, status: 'ongoing', userId: authUserId } 
        });

        if (!route) return res.status(403).json({ status: 'fail', message: "Accès refusé" });

        const trace = await VisitedTrace.create({
            routeId,
            lat,
            lng,
            createdAt: timestamp || new Date()
        });

        const poiResult = await checkGeofencing(routeId, lat, lng);

        if (poiResult) {

            const alreadyVisited = await VisitedTrace.findOne({
                where: { routeId, poiId: poiResult.id }
            });

            if (!alreadyVisited) {

                await trace.update({ 
                    poiId: poiResult.id,
                    order: poiResult.order 
                });
            }
        }

        res.status(201).json({
            status: 'success',
            reachedPoi: poiResult ? poiResult.id : null,
            data: trace
        });

    } catch (error) {
        res.status(500).json({ status: 'fail', message: error.message });
    }
};


exports.addTraceBatch = async (req, res) => {

    const transaction = await sequelize.transaction();
    try {
        const { routeId, traceList } = req.body;

        if (!Array.isArray(traceList) || traceList.length === 0) {
            return res.status(400).json({ status: 'fail', message: "Liste vide." });
        }

        const tracesData = traceList.map(t => ({
            routeId,
            lat: t.lat,
            lng: t.lng,
            createdAt: t.timestamp || new Date()
        }));

        const createdTraces = await VisitedTrace.bulkCreate(tracesData, { 
            transaction,
            returning: true
        });

        const lastPoint = traceList[traceList.length - 1];
        const poiResult = await checkGeofencing(routeId, lastPoint.lat, lastPoint.lng);

        let finalReachedPoi = null;

        if (poiResult) {
            const alreadyVisited = await VisitedTrace.findOne({
                where: { routeId, poiId: poiResult.id },
                transaction 
            });

            if (!alreadyVisited) {
                const lastTraceRecord = createdTraces[createdTraces.length - 1];
                await lastTraceRecord.update({
                    poiId: poiResult.id,
                    order: poiResult.order
                }, { transaction });
                
                finalReachedPoi = poiResult.id;
            }
        }

        await transaction.commit();

        res.status(201).json({ 
            status: 'success', 
            results: createdTraces.length,
            reachedPoi: finalReachedPoi
        });

    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error("Batch Trace Error:", error.message);
        res.status(500).json({ status: 'fail', message: error.message });
    }
};

exports.getRouteTraces = async (req, res) => {
    try {
        const { routeId } = req.params;

        const traces = await VisitedTrace.findAll({
            where: { routeId },
            order: [['createdAt', 'ASC']],
            attributes: ['id', 'lat', 'lng', 'createdAt', 'poiId', 'order'],
            include: [{
                model: POI,
                as: 'poi',
            }]
        });

        res.status(200).json({ 
            status: 'success', 
            count: traces.length,
            data: traces 
        });
    } catch (error) {
        res.status(500).json({ status: 'fail', message: error.message });
    }
};


exports.getRouteTraceSegment = async (req, res) => {
    try {
        const { routeId } = req.params;
        const { startTime, endTime } = req.query;

        const start = new Date(startTime);
        const end = new Date(endTime);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ 
                status: 'fail', 
                message: "Format de date invalide. Utilisez le format ISO (ex: 2025-12-17T10:00:00Z)." 
            });
        }

        const traces = await VisitedTrace.findAll({
            where: {
                routeId,
                createdAt: { 
                    [Op.between]: [start, end] 
                }
            },
            order: [['createdAt', 'ASC']],
            attributes: ['lat', 'lng', 'createdAt', 'poiId'] 
        });

        res.status(200).json({ 
            status: 'success', 
            results: traces.length,
            data: traces 
        });
    } catch (error) {
        res.status(500).json({ status: 'fail', message: error.message });
    }
};