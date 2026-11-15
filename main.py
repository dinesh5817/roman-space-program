from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import json
from datetime import datetime, timedelta, timezone
import random
from fastapi.responses import HTMLResponse


app = FastAPI()
templates = Jinja2Templates(directory="templates")

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/media", StaticFiles(directory="media"), name="media")


WEATHERS = [
    ("Clear", 0.1),
    ("Fair", 0.2),
    ("Partly Cloudy", 0.35),
    ("Cloudy", 0.45),
    ("Windy", 0.55),
    ("Shear", 0.7),
    ("Storm", 0.8),
    ("Severe", 0.9),
]


@app.get("/")
def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="home.html",
    )


@app.get("/agency_name")
def agency_name(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="agency_name.html",
    )


@app.get("/glossary")
def glossary(request: Request):
    with open("static/datasets/Meteorite_Landings.json") as f:
        data = json.load(f)

    meteorites = data["data"][:8]

    return templates.TemplateResponse(
        request=request,
        name="glossary.html",
        context={"meteorites": meteorites},
    )


@app.get("/shop")
def shop(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="shop.html",
    )


@app.get("/window")
def window(request: Request):
    now = datetime.now(timezone.utc)
    start = now + timedelta(days=30)
    end = now + timedelta(days=37)

    approved_windows = {}
    for i in range(1, 9):
        delta = end - start
        random_seconds = random.randint(0, int(delta.total_seconds()))
        launch_dt = start + timedelta(seconds=random_seconds)

        weather_name, difficulty = random.choice(WEATHERS)

        approved_windows[f"window_{i}"] = {
            "date": launch_dt.strftime("%Y-%m-%d"),
            "time": launch_dt.strftime("%H:%M UTC"),
            "weather": weather_name,
            "difficulty": difficulty,
        }

    return templates.TemplateResponse(
        request=request,
        name="window.html",
        context={"windows": approved_windows},
    )


@app.get("/flight")
def flight(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="flight.html",
    )


@app.get("/result", response_class=HTMLResponse)
async def result(request: Request):
    return templates.TemplateResponse(
        "result.html",
        {"request": request}
    )
