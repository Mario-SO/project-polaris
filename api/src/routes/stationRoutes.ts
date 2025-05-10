import { Hono } from 'hono';
import { getAllStations, getStationById } from '../controllers/stationController';

const stationRoutes = new Hono();

stationRoutes.get('/stations', getAllStations);
stationRoutes.get('/stations/:stationId', getStationById);

export default stationRoutes; 