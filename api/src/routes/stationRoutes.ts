import { Hono } from 'hono';
import { getAllStations, getStationById, getStationDepartures } from '../controllers/stationController';

const stationRoutes = new Hono();

stationRoutes.get('/stations', getAllStations);
stationRoutes.get('/stations/:stationId', getStationById);
stationRoutes.get('/stations/:stationId/departures', getStationDepartures);

export default stationRoutes; 