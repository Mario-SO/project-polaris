# 🚄 Renfe Timetables API 🚆

Welcome to the Renfe Timetables API project! This project aims to provide a super easy-to-use REST API for accessing Renfe Cercanías (commuter rail) timetables in Spain, making this valuable data more accessible for developers to build their own applications. 🇪🇸✨

Currently, the official data is provided in GTFS format, which, while comprehensive, isn't directly API-friendly. Another option is to use their official site, which is also not the best, or third party apps, which, even though they work cool and all, normally they dont provide an open API. This project bridges that gap!

## ⭐ Current Features (MVP)

*   ✅ **Daily Data Fetching**: Automatically downloads the latest GTFS data for Renfe Cercanías daily via a GitHub Action.
*   💾 **SQLite Database**: Parses and stores the GTFS data into an SQLite database for efficient querying.
*   🚀 **Timetable API Endpoint**: Provides an API endpoint `GET /{departureStation}/{arrivalStation}` to retrieve direct trip schedules between two stations.

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
│   │   ├── index.ts          # Hono API application entry point
│   │   └── load-data.ts      # Script to load GTFS data into SQLite
│   ├── package.json          # API dependencies (Hono, etc.)
│   └── tsconfig.json         # TypeScript configuration for the API
├── data/                     # Stores raw GTFS .txt files and the gtfs.sqlite database
├── scripts/
│   └── get-timetables.ts     # Script to download and unzip GTFS data
├── README.md                 # This file!
└── ...                       # Other project files ( .gitattributes, etc.)
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

8.  **Test the Endpoint:**
    Use `curl` or a tool like Postman:
    ```bash
    curl "http://localhost:3000/Valdemoro/Sol"
    ```
    Replace `Valdemoro` and `Sol` with your desired station names (partial, case-insensitive matching is supported for the MVP).

## 📝 TODO List & Next Steps

Here's a roadmap of planned enhancements and features:

### API Enhancements ⚙️

*   [ ] **Date & Day Filtering**: Implement proper filtering based on `calendar.txt` and `calendar_dates.txt` to show schedules for specific dates/days of the week (e.g., `GET /{dep}/{arr}?date=YYYY-MM-DD`).
*   [ ] **Improved Station Matching**: 
    *   Handle ambiguous station names more gracefully (e.g., return multiple candidates for user selection).
    *   Consider Levenshtein distance or similar for typo correction.
*   [ ] **Transfer Support**: Add logic to find journeys that require one or more transfers.
*   [ ] **Pagination**: Implement pagination for API responses (e.g., `?page=1&limit=20`).
*   [ ] **Advanced Querying**: Allow querying by arrival time, duration, etc.
*   [ ] **Input Validation**: Add more robust input validation for API parameters.

### New API Endpoints 🗺️

*   [ ] `GET /stations`: List all available stations (perhaps with autocomplete support `?q=partial_name`).
*   [ ] `GET /stations/{station_id}`: Get details for a specific station.
*   [ ] `GET /stations/{station_name_or_id}/departures?date=YYYY-MM-DD&time=HH:MM`: Get all departures from a specific station.
*   [ ] `GET /routes`: List all available routes (e.g., C1, C2, C3).
*   [ ] `GET /routes/{route_id}`: Get details for a specific route, including its stops.
*   [ ] `GET /routes/{route_id}/schedule?date=YYYY-MM-DD`: Get the full schedule for a specific route on a given date.
*   [ ] `GET /trip/{trip_id}`: Get detailed information for a specific trip, including all its stop times.

### Deployment & Operations 🚢

*   [ ] **Automated API Deployment**: Set up CI/CD to deploy the Hono API (e.g., to Cloudflare Workers, Fly.io, Vercel, or a similar platform).
*   [ ] **Health Check Endpoint**: Add a `/health` endpoint for monitoring.
*   [ ] **Logging & Monitoring**: Implement more structured logging and monitoring for the API.

### Documentation & Development Experience 📚

*   [ ] **API Documentation**: Generate OpenAPI (Swagger) documentation.
*   [ ] **Testing**: Add unit and integration tests for the API logic and data loading scripts.
*   [ ] **Refine CSV Parsing**: Make the CSV parser in `load-data.ts` more robust (e.g., handle escaped quotes/commas within fields if present in source data).

## 🙌 Contributing

Contributions are welcome! If you have ideas or want to help, feel free to open an issue or submit a pull request. (Details TBD)