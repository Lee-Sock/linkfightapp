# Link Fight — Simple 2-Node Prototype (Refactored)

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from app.routers import debug, gm, player, ui
import traceback
import sys

# Initialize FastAPI application
app = FastAPI(title="Link Fight — Simple 2-Node Prototype (MVP)")

# Exception handler
@app.exception_handler(Exception)
async def any_error(request: Request, exc: Exception):
    """Make 500s visible in terminal and return simple JSON."""
    print("\n=== UNHANDLED ERROR ===", file=sys.stderr)
    traceback.print_exc()
    return JSONResponse({"error": str(exc)}, status_code=500)

# Mount static files directory
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Include routers
app.include_router(debug.router)
app.include_router(gm.router)
app.include_router(player.router)
app.include_router(ui.router)

# Run server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
