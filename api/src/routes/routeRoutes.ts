import { Hono } from 'hono';
import { getAllRoutes, getRouteById } from '../controllers/routeController';

const routeRoutes = new Hono();

routeRoutes.get('/', getAllRoutes);
routeRoutes.get('/:routeId', getRouteById);

export default routeRoutes;