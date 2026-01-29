# Conversion utilities for azimuth and angle calculations

def ticks_to_deg(ticks: int) -> float:
    """Convert 7200-tick scale to degrees.

    7200 ticks = 360 deg -> 1 tick = 0.05 deg
    """
    return ((ticks % 7200) * 0.05) % 360.0

def deg_wrap180(d: float) -> float:
    """Wrap degrees to -180 to +180 range."""
    d = (d + 180.0) % 360.0 - 180.0
    return d
