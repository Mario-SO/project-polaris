# 🚄 Renfe Timetables API 🚆

Welcome to the Renfe Timetables API project! This project aims to provide a super easy-to-use REST API for accessing Renfe Cercanías (commuter rail) timetables in Spain, making this valuable data more accessible for developers to build their own applications. 🇪🇸✨

Currently, the official data is provided in GTFS format, which, while comprehensive, isn't directly API-friendly. Another option is to use their official site, which is also not the best, or third party apps, which, even though they work cool and all, normally they dont provide an open API. This project bridges that gap!

## ⭐ Current Features

*   ✅ **Daily Data Fetching**: Automatically downloads the latest GTFS data for Renfe Cercanías daily via a GitHub Action.
*   💾 **SQLite Database**: Parses and stores the GTFS data into an SQLite database for efficient querying.
*   🚀 **API Endpoints**:
    *   `GET /`: Welcome message.
    *   `GET /stations`: Lists all stations. Supports fuzzy search with `?q={query}`.
    *   `GET /stations/{stationId}`: Retrieves details for a specific station by its ID.
    *   `GET /timetable/{departureStation}/{arrivalStation}`: Retrieves direct trip schedules. Defaults to today's date. Supports specific date querying with `?date={YYYY-MM-DD}`. Results are grouped to show unique departure/arrival time slots for the effective date.
    *   `GET /timetable/{departureStation}/{arrivalStation}/next`: Retrieves the very next available train for the route based on the current time in Spain.
    *   `GET /stations/{stationId}/departures?date=YYYY-MM-DD&time=HH:MM`: Get all departures from a specific station. Defaults to current date/time if omitted.
    *   `GET /routes`: List all available routes (e.g., C1, C2, C3).
    *   `GET /routes/{routeId}`: Get details for a specific route, including its stops.
*   🧪 **Unit & Integration Tests**: Comprehensive test suite for API endpoints and logic.

## 🛠️ Technology Stack

*   **Runtime & Toolkit**: [Bun](https://bun.sh/) (JavaScript runtime, package manager, bundler)
*   **Web Framework**: [HonoJS](https://hono.dev/) (Fast, lightweight, and works great with Bun!)
*   **Language**: [TypeScript](https://www.typescriptlang.org/)
*   **Database**: [SQLite](https://www.sqlite.org/index.html) (using `bun:sqlite`)
*   **Data Source**: Renfe's official GTFS feed.
*   **CI/CD**: [GitHub Actions](https://github.com/features/actions) (for daily data fetching and processing).
*   **Large File Storage**: [Git LFS](https://git-lfs.github.com/) (for handling large data files in the repository).

## 📂 Project Structure

```
project-polaris/
├── .github/workflows/        # GitHub Actions workflows (e.g., fetch-timetables.yml)
├── api/
│   ├── src/
│   │   ├── config/           # Configuration files
│   │   ├── controllers/      # Request handlers
│   │   ├── routes/           # API route definitions
│   │   ├── services/         # Business logic
│   │   ├── utils/            # Utility functions
│   │   ├── index.ts          # Hono API application entry point
│   │   ├── index.test.ts     # Tests for the API
│   │   └── load-data.ts      # Script to load GTFS data into SQLite
│   ├── package.json          # API dependencies (Hono, etc.)
│   ├── tsconfig.json         # TypeScript configuration for the API
│   ├── bun.lockb             # Bun lockfile
│   └── .gitignore            # Git ignore for api directory
├── data/                     # Stores raw GTFS .txt files and the gtfs.sqlite database
├── scripts/
│   └── get-timetables.ts     # Script to download and unzip GTFS data
├── .gitattributes            # Git LFS attributes
├── .gitignore                # Git ignore for project root
├── README.md                 # This file!
└── ...                       # Other project files (e.g. .git/)
```

## 🚀 Getting Started & Running Locally

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Mario-SO/project-polaris.git
    cd project-polaris
    ```

2.  **Install Git LFS:**
    Make sure you have Git LFS installed. Download it from [git-lfs.github.com](https://git-lfs.github.com/) and run `git lfs install` once on your system.

3.  **Install Bun:**
    If you don't have Bun, install it from [bun.sh](https://bun.sh/).

4.  **Fetch GTFS Data:**
    (This is normally done by the GitHub Action, but you can run it manually too)
    ```bash
    bun run ./scripts/get-timetables.ts
    ```

5.  **Install API Dependencies:**
    ```bash
    cd api
    bun install
    cd ..
    ```

6.  **Load Data into SQLite Database:**
    ```bash
    bun run ./api/src/load-data.ts
    ```
    This will create/update `data/gtfs.sqlite`.

7.  **Run the API Server:**
    ```bash
    bun run ./api/src/index.ts
    ```
    The API should now be running, typically on `http://localhost:3000`.

8.  **Test the Endpoints:**
    Use `curl` or a tool like Postman. Examples:

    *   Get welcome message:
        ```bash
        curl "http://localhost:3000/"
        ```
    *   List all stations:
        ```bash
        curl "http://localhost:3000/stations"
        ```
    *   Search for stations (e.g., "madrid"):
        ```bash
        curl "http://localhost:3000/stations?q=madrid"
        ```
    *   Get details for a specific station ID (replace `10000` with a valid ID):
        ```bash
        curl "http://localhost:3000/stations/10000"
        ```
    *   Get timetable between Valdemoro and Sol (defaults to today):
        ```bash
        curl "http://localhost:3000/timetable/Valdemoro/Sol"
        ```
    *   Get timetable for a specific date:
        ```bash
        curl "http://localhost:3000/timetable/Valdemoro/Sol?date=2024-08-15"
        ```
    *   Get the next train from Valdemoro to Sol:
        ```bash
        curl "http://localhost:3000/timetable/Valdemoro/Sol/next"
        ```
    Replace station names and IDs with your desired values. Partial, case-insensitive matching is supported for station names in path parameters.

9.  **Run Tests:**
    To execute the test suite:
    ```bash
    bun test ./api/src/index.test.ts
    ```

## 📖 API Endpoints Detailed

Here's a breakdown of the available API endpoints:

### `GET /`
*   **Description**: Returns a simple welcome message from the API.
*   **Example**: `curl "http://localhost:3000/"`
*   **Response**: `Hello from Renfe Timetables API!`

### `GET /stations`
*   **Description**: Retrieves a list of all available train stations.
*   **Query Parameters**:
    *   `q` (optional): A string to filter station names. Performs a case-insensitive "LIKE" search (e.g., `q=Madrid` will find "Madrid-Principe Pio", "MADRID-CHAMARTIN-CLARA CAMPOAMOR", etc.). Returns a maximum of 50 results when `q` is used.
*   **Examples**:
    *   `curl "http://localhost:3000/stations"` (gets all stations)
    *   `curl "http://localhost:3000/stations?q=Atocha"` (searches for stations containing "Atocha")
*   **Response**: An array of station objects, each with `stop_id`, `stop_name`, `stop_lat`, `stop_lon`.

### `GET /stations/{stationId}`
*   **Description**: Fetches details for a specific station using its `stop_id`.
*   **Path Parameters**:
    *   `stationId`: The unique identifier of the station (e.g., `10000`).
*   **Example**: `curl "http://localhost:3000/stations/10000"`
*   **Response**: A station object with `stop_id`, `stop_name`, `stop_lat`, `stop_lon`, or a 404 error if not found.

### `GET /stations/{stationId}/departures`
*   **Description**: Retrieves all departure times from a specific station. Supports optional `date` (`YYYY-MM-DD`) and `time` (`HH:MM`) query parameters (defaults to current date and time in Spain).
*   **Path Parameters**:
    *   `stationId`: The unique identifier or name (partial match) of the station.
*   **Query Parameters**:
    *   `date` (optional): Date in `YYYY-MM-DD` format.
    *   `time` (optional): Time in `HH:MM` format.
*   **Example**:
    ```bash
    curl "http://localhost:3000/stations/10000/departures?date=2024-07-01&time=08:00"
    ```
*   **Response**: A JSON object containing `station_found`, `station_id`, `date_queried`, `time_queried`, and an array of `departures`.

### `GET /routes`
*   **Description**: Lists all available routes.
*   **Example**:
    ```bash
    curl "http://localhost:3000/routes"
    ```
*   **Response**: An array of route objects with `route_id`, `route_short_name`, and `route_long_name`.

### `GET /routes/{routeId}`
*   **Description**: Retrieves details for a specific route, including the ordered list of stops.
*   **Path Parameters**:
    *   `routeId`: The identifier of the route (e.g., `C1`).
*   **Example**:
    ```bash
    curl "http://localhost:3000/routes/C1"
    ```
*   **Response**: A JSON object containing `route_id`, `route_short_name`, `route_long_name`, and an array of `stops` each with `stop_id`, `stop_name`, and `stop_sequence`.

## 💡 Important Notes on API Usage

*   **Station Name Matching**: For endpoints using station names in path parameters (`/timetable/{departureStation}/{arrivalStation}` and `/timetable/.../next`), the API performs a case-insensitive, partial match against station names in the database. It will use the *first* station found that matches the provided term. For more precise control, use station IDs where possible or ensure your search terms are specific enough. The `/stations?q=` endpoint can help identify full names and IDs.
*   **Date Handling**:
    *   The `GET /timetable/{departureStation}/{arrivalStation}` endpoint defaults to the **current server's local date** if no `date` query parameter is supplied.
    *   When a `date` is provided (e.g., `?date=2024-08-20`), the API will query for that specific date.
    *   Invalid date formats for the `date` parameter will result in a 400 error.
*   **"Next Train" Timezone**: The `GET /timetable/{departureStation}/{arrivalStation}/next` endpoint specifically uses the **current time in Spain (Europe/Madrid)** to determine the "next" train. This ensures relevance for users in Spain, regardless of the server's physical location or local time.
*   **Character Encoding in Station Names**:
    *   When querying station names that include special characters (e.g., tildes like in "Chamartín", or other accented characters), these characters **must be URL-encoded** in the request path or query parameters.
    *   For example, to search for "Chamartín":
        *   **Incorrect (likely to fail or give wrong results):** `curl http://localhost:3000/timetable/Chamartín/Atocha`
        *   **Correct (URL-encoded `í` as `%C3%AD`):** `curl http://localhost:3000/timetable/Chamart%C3%ADn/Atocha`
    *   Similarly, if using the `/stations?q=` endpoint:
        *   **Incorrect:** `curl "http://localhost:3000/stations?q=Chamartín"`
        *   **Correct:** `curl "http://localhost:3000/stations?q=Chamart%C3%ADn"`
    *   Most HTTP clients and libraries will handle URL encoding automatically if you construct the URL correctly with the special characters. However, if you are manually crafting `curl` commands or building URLs, ensure proper encoding for reliable results. The API itself handles UTF-8 correctly on the backend, but the URL must be valid.

## 📝 TODO List & Next Steps

Here's a roadmap of planned enhancements and features:

### API Enhancements ⚙️

*   [x] **Date & Day Filtering**: Defaults to today, specific date via query param.
*   [ ] **Improved Station Matching**: 
    *   Handle ambiguous station names more gracefully (e.g., return multiple candidates for user selection instead of just the first match).
*   [ ] **Transfer Support**: Add logic to find journeys that require one or more transfers.
*   [ ] **Input Validation**: Add more robust input validation for API parameters (some basic validation for date format exists).

### New API Endpoints 🗺️

*   [x] `GET /stations`: List all available stations (perhaps with autocomplete support `?q=partial_name`).
*   [x] `GET /stations/{station_id}`: Get details for a specific station.
*   [x] `GET /stations/{station_name_or_id}/departures?date=YYYY-MM-DD&time=HH:MM`: Get all departures from a specific station.
*   [x] `GET /routes`: List all available routes (e.g., C1, C2, C3).
*   [x] `GET /routes/{route_id}`: Get details for a specific route, including its stops.

### Deployment & Operations 🚢

*   [ ] **Automated API Deployment**: Set up CI/CD to deploy the Hono API (e.g., to Cloudflare Workers, Fly.io, Vercel, or a similar platform).
*   [x] **Health Check Endpoint**: Add a `/health` endpoint for monitoring.
*   [x] **Logging & Monitoring**: Implement more structured logging and monitoring for the API.

### Documentation & Development Experience 📚

*   [ ] **API Documentation**: Generate OpenAPI (Swagger) documentation.
*   [x] **Testing**: ~~Add unit and integration tests for the API logic and data loading scripts.~~ (Implemented for API endpoints)
*   [ ] **Refine CSV Parsing**: Make the CSV parser in `load-data.ts` more robust (e.g., handle escaped quotes/commas within fields if present in source data).

## 🙌 Contributing

Contributions are welcome! If you have ideas or want to help, feel free to open an issue or submit a pull request.
