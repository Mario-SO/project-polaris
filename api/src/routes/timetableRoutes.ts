import { Hono } from 'hono';
import { getTimetable, getNextTrain } from '../controllers/timetableController';

const timetableRoutes = new Hono();

timetableRoutes.get('/:departureStation/:arrivalStation', getTimetable);
timetableRoutes.get('/:departureStation/:arrivalStation/next', getNextTrain);

export default timetableRoutes; 