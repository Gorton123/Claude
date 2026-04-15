"""QuantumEarth AI — FastAPI backend server.

Run with:
    python server.py
Then open the frontend at http://localhost:8080 (serve with: python -m http.server 8080)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="QuantumEarth AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Lazy imports (keeps startup fast; quantum libs load only when needed) ─────
_optimizer = None
_climate   = None

def get_optimizer():
    global _optimizer
    if _optimizer is None:
        from quantum import optimizer as opt
        _optimizer = opt
    return _optimizer

def get_climate():
    global _climate
    if _climate is None:
        from quantum import climate as cli
        _climate = cli
    return _climate


# ── Request/response models ───────────────────────────────────────────────────

class OptimizeRequest(BaseModel):
    scenario: str          # "energy" | "disaster"
    region: str            # africa | europe | asia | americas | global
    n_sites: Optional[int] = 8

class ClimateRequest(BaseModel):
    region: str            # africa | europe | asia | americas | global
    resolution: Optional[int] = 8


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "QuantumEarth AI"}


@app.post("/api/optimize")
def optimize(req: OptimizeRequest):
    if req.scenario not in ("energy", "disaster"):
        raise HTTPException(400, "scenario must be 'energy' or 'disaster'")
    from quantum.utils import REGIONS
    if req.region not in REGIONS:
        raise HTTPException(400, f"region must be one of {list(REGIONS.keys())}")

    opt = get_optimizer()
    n = max(4, min(req.n_sites or 8, 12))

    if req.scenario == "energy":
        result = opt.energy_optimizer(req.region, n_sites=n)
    else:
        result = opt.disaster_router(req.region, n_sites=n)

    return result


@app.post("/api/climate")
def climate(req: ClimateRequest):
    from quantum.utils import REGIONS
    if req.region not in REGIONS:
        raise HTTPException(400, f"region must be one of {list(REGIONS.keys())}")

    cli = get_climate()
    res = max(4, min(req.resolution or 8, 12))
    result = cli.climate_anomaly_scan(req.region, resolution=res)
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
