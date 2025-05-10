// Helper function to get day of the week (0=Sunday, 1=Monday, ..., 6=Saturday)
// GTFS calendar often uses 0/1 for service days, so we'll map to day names for query
export const getDayOfWeekName = (date: Date): string => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()];
}; 