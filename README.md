# Roman Space Program

Roman Space Program is a rocket-design and flight-simulation game built for
the **NASA Space Apps Challenge 2026** by **Roman Space Exploration (Roman SX)**.
Players assemble a launch vehicle, choose a launch window, and guide an ascent
toward a Sun–Earth L2 mission objective.

## Gameplay

1. Establish an agency name.
2. Assemble a rocket from engines, propellant tanks, stages, boosters, and a
   radio system.
3. Choose a generated launch window.
4. Authorize launch, manage throttle and staging, and monitor flight telemetry.
5. Review the mission result.

The site also includes a page displaying records from the bundled NASA
Meteorite Landings dataset.

## NASA's Data source Usage

The meteorite records are from NASA's [Meteorite Landings dataset](https://data.nasa.gov/dataset/meteorite-landings).

## AI / SI Use

SI tools were used during implementation. See
[SI_USAGE.txt](./static/SI_USAGE.txt) for the tools used and the developer's
estimated contribution breakdown.

## Run locally

Requirements: Python 3.12 or newer and [uv](https://docs.astral.sh/uv/).

```bash
uv sync
uv run uvicorn main:app --reload
```

Open <http://127.0.0.1:8000>.

## Simulation note

The flight model is a simplified two-dimensional game simulation. It is
physics-inspired, but the equations are simplified and less accurate for players to understand the game quickly.
