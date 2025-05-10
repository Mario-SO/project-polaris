import { Hono } from 'hono';
import { getAllRoutes, getRouteById } from '../controllers/routeController';

const routeRoutes = new Hono();

routeRoutes.get('/routes', getAllRoutes);
routeRoutes.get('/routes/:routeId', getRouteById);

export default routeRoutes; 