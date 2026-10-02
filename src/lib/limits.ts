// Page and export caps live here so the numbers are named, shared, and — more
// importantly — so every endpoint that truncates can say so in its response.
// Silently returning 1000 records while reporting "5000" is worse than a cap.

export const TASKS_PAGE_SIZE = 200
export const DATASETS_PAGE_SIZE = 1000
export const EXPORT_MAX_RECORDS = 2000
export const SOURCES_PAGE_SIZE = 300