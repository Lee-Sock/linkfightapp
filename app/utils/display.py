# Display and formatting utilities

def rx_color(rx_dbm: float) -> str:
    """Return color coding for signal strength."""
    if rx_dbm < -93.0:   return "green"   # Best link
    if -95.0 <= rx_dbm < -93.0: return "orange"
    if -103.0 <= rx_dbm < -95.0: return "orange"
    if -110.0 <= rx_dbm < -103.0: return "red"
    return "red"  # Anything worse than -110 is also red
